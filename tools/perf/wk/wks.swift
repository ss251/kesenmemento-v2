// [perf] Copied from the splat lane's tools/splat/wk/wks.swift (itself from the art lane L2's WebKit harness), for tools/perf/wk-run.mjs: the frame
// pacing of Safari's engine. Change: KLC_REAL_RAF=1 keeps WebKit's own requestAnimationFrame (the display's vsync) instead of the timer pump.
// A WebKit (WKWebView, not Chrome) session driven through files: it loads a URL in a hidden window and executes commands written to <workdir>/cmd.json
// (one at a time, answered in <workdir>/res-<id>.json). Hidden pages get no requestAnimationFrame from WebKit, so a document-start script replaces it with a
// timer-driven one that can be paused and stepped by hand (window.__raf). Here: timing and looking at the splat rooms in Safari's engine (the phone's), while the shared Chrome lock is busy.
// Build: swiftc -O tools/splat/wk/wks.swift -o <somewhere>/splatwks     Run it under the machine's load guard: tools/anime/gate.sh run <somewhere>/splatwks <url> <workdir> [w h]
//   wks <url> <workdir> [width height]
// commands: {"id":n,"op":"eval","js":"<async function body>","timeout":120}  {"id":n,"op":"load","url":"...","timeout":300}  {"id":n,"op":"quit"}
import AppKit
import WebKit

setvbuf(stdout, nil, _IOLBF, 0)
let args = CommandLine.arguments
guard args.count >= 3, let startURL = URL(string: args[1]) else { print("usage: wks <url> <workdir> [w h]"); exit(64) }
let workdir = URL(fileURLWithPath: args[2], isDirectory: true)
let W: CGFloat = args.count > 4 ? CGFloat(Double(args[3]) ?? 1600) : 1600
let H: CGFloat = args.count > 4 ? CGFloat(Double(args[4]) ?? 900) : 900
try? FileManager.default.createDirectory(at: workdir, withIntermediateDirectories: true)

let realRaf = ProcessInfo.processInfo.environment["KLC_REAL_RAF"] == "1"
let reduceMotion = ProcessInfo.processInfo.environment["KLC_REDUCE"] == "1"
let reduceJS = reduceMotion ? "const __mm=window.matchMedia.bind(window);window.matchMedia=(q)=>String(q).includes('prefers-reduced-motion')?{matches:true,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}:__mm(q);" : ""
let pre = """
(()=>{
 \(reduceJS)
 window.__console=[];
 for(const k of ['log','warn','error','info']){const o=console[k];console[k]=(...a)=>{try{window.__console.push(k+': '+a.map(x=>typeof x==='string'?x:(x&&x.stack)||JSON.stringify(x)).join(' ').slice(0,2000));if(window.__console.length>400)window.__console.shift()}catch(e){}o.apply(console,a)}}
 window.addEventListener('error',e=>window.__console.push('onerror: '+e.message+' '+e.filename+':'+e.lineno));
 window.addEventListener('unhandledrejection',e=>window.__console.push('unhandled: '+(e.reason&&e.reason.stack||e.reason)));
 // the page is never visible to WebKit here: say it is, and run requestAnimationFrame from a timer that can be paused and stepped
 try{Object.defineProperty(document,'visibilityState',{get:()=> 'visible'});Object.defineProperty(document,'hidden',{get:()=>false})}catch(e){}
 const q=new Map();let id=0,on=true,timer=0;
 const run=()=>{const t=performance.now();const cbs=[...q];q.clear();for(const [i,cb] of cbs){try{cb(t)}catch(e){console.error('raf callback',e)}}};
 const pump=()=>{timer=0;if(!on)return;const t0=performance.now();run();if(q.size&&on&&!timer)timer=setTimeout(pump,Math.max(0,16.667-(performance.now()-t0)))};   // [perf] a frame every 16.7 ms from its start (60 Hz), at once when it ran over
 if(!window.__klcRealRaf){
 window.requestAnimationFrame=(cb)=>{const i=++id;q.set(i,cb);if(on&&!timer)timer=setTimeout(pump,16);return i};
 window.cancelAnimationFrame=(i)=>{q.delete(i)};
 }
 window.__raf={pause(){on=false;if(timer){clearTimeout(timer);timer=0}},resume(){on=true;if(q.size&&!timer)timer=setTimeout(pump,16)},step(n=1){for(let k=0;k<n;k++)run();return q.size},get pending(){return q.size},get running(){return on}};
})();
"""

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
app.finishLaunching()
let conf = WKWebViewConfiguration()
if ProcessInfo.processInfo.environment["KLC_WK_EPHEMERAL"] == "1" { conf.websiteDataStore = .nonPersistent() }
func trySPI(_ obj: NSObject, _ name: String, _ on: Bool) {
  let sel = NSSelectorFromString(name)
  if obj.responds(to: sel) { _ = obj.perform(sel, with: on ? NSNumber(value: true) : nil) } else { print("SPI missing \(name)") }
}
conf.preferences.inactiveSchedulingPolicy = .none
if ProcessInfo.processInfo.environment["KLC_AUTOPLAY"] == "1" {
  conf.mediaTypesRequiringUserActionForPlayback = []
}
trySPI(conf.preferences, "_setHiddenPageDOMTimerThrottlingEnabled:", false)
trySPI(conf.preferences, "_setPageVisibilityBasedProcessSuppressionEnabled:", false)
conf.userContentController.addUserScript(WKUserScript(source: (realRaf ? "window.__klcRealRaf=true;" : "") + pre, injectionTime: .atDocumentStart, forMainFrameOnly: true))
let web = WKWebView(frame: NSRect(x: 0, y: 0, width: W, height: H), configuration: conf)
trySPI(web, "_setWindowOcclusionDetectionEnabled:", false)
// [perf] KLC_DSF=3: the page's devicePixelRatio (Safari's responsive design mode SPI), so a 390x844 window is an iPhone-sized page at DPR 3
if let dsf = ProcessInfo.processInfo.environment["KLC_DSF"], let v = Double(dsf) {
  let sel = NSSelectorFromString("_setOverrideDeviceScaleFactor:")
  if web.responds(to: sel), let m = class_getMethodImplementation(type(of: web), sel) {
    typealias F = @convention(c) (AnyObject, Selector, CGFloat) -> Void
    unsafeBitCast(m, to: F.self)(web, sel, CGFloat(v))
  } else { print("SPI missing _setOverrideDeviceScaleFactor:") }
}
let win = NSWindow(contentRect: NSRect(x: 8, y: 8, width: W, height: H), styleMask: [.borderless], backing: .buffered, defer: false)
win.contentView = web
win.alphaValue = 0.02
win.ignoresMouseEvents = true
win.orderFrontRegardless()

final class Nav: NSObject, WKNavigationDelegate {
  var finished = false, failed: String? = nil
  func webView(_ w: WKWebView, didFinish n: WKNavigation!) { finished = true }
  func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) { failed = "\(e)"; finished = true }
  func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { failed = "\(e)"; finished = true }
  func webViewWebContentProcessDidTerminate(_ w: WKWebView) { failed = "web content process terminated"; finished = true; deaths += 1; print("WEBCONTENT PROCESS TERMINATED at \(Date())") }
}
let nav = Nav()
web.navigationDelegate = nav

func write(_ id: Int, _ obj: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: obj, options: [.fragmentsAllowed]) else {
    let fallback = "{\"ok\":false,\"error\":\"unserialisable result\"}".data(using: .utf8)!
    try? fallback.write(to: workdir.appendingPathComponent("res-\(id).json")); return
  }
  let tmp = workdir.appendingPathComponent("res-\(id).json.tmp"), dst = workdir.appendingPathComponent("res-\(id).json")
  try? data.write(to: tmp); try? FileManager.default.removeItem(at: dst); try? FileManager.default.moveItem(at: tmp, to: dst)
}

var busy = false
var lastPing = Date()
var deaths = 0
var lastURL: URL = startURL
func handle(_ cmd: [String: Any]) {
  let id = cmd["id"] as? Int ?? 0, op = cmd["op"] as? String ?? ""
  let timeout = (cmd["timeout"] as? Double) ?? 120
  switch op {
  case "quit":
    write(id, ["ok": true, "value": "bye"]); RunLoop.main.run(until: Date().addingTimeInterval(0.2)); exit(0)
  case "load":
    guard let s = cmd["url"] as? String, let u = URL(string: s) else { write(id, ["ok": false, "error": "bad url"]); return }
    nav.finished = false; nav.failed = nil; lastURL = u
    web.load(URLRequest(url: u, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData))
    busy = true
    let t0 = Date()
    while !nav.finished && Date().timeIntervalSince(t0) < timeout { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
    busy = false
    write(id, nav.finished && nav.failed == nil ? ["ok": true, "value": "loaded"] : ["ok": false, "error": nav.failed ?? "load timeout"])
  case "page":
    guard let path = cmd["file"] as? String else { write(id, ["ok": false, "error": "no file"]); return }
    var done = false, errMsg: String? = nil
    busy = true
    let oldAlpha = win.alphaValue
    win.alphaValue = 1
    let snap = WKSnapshotConfiguration()
    snap.rect = web.bounds
    web.takeSnapshot(with: snap) { img, e in
      win.alphaValue = oldAlpha
      if let e = e { errMsg = "\(e)" }
      else if let img = img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) {
        do { try png.write(to: URL(fileURLWithPath: path)) } catch { errMsg = "\(error)" }
      } else { errMsg = "no image" }
      done = true
    }
    let t1 = Date()
    while !done && Date().timeIntervalSince(t1) < timeout { RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
    busy = false
    write(id, errMsg == nil && done ? ["ok": true, "value": path] : ["ok": false, "error": errMsg ?? "timeout"])
  case "eval":
    guard let js = cmd["js"] as? String else { write(id, ["ok": false, "error": "no js"]); return }
    var done = false, out: [String: Any] = ["ok": false, "error": "timeout"]
    busy = true
    web.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { result in
      switch result {
      case .success(let v): out = ["ok": true, "value": v]
      case .failure(let e): out = ["ok": false, "error": "\(e)"]
      }
      done = true
    }
    let t0 = Date()
    while !done && Date().timeIntervalSince(t0) < timeout { RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
    busy = false
    write(id, out)
  default:
    write(id, ["ok": false, "error": "unknown op \(op)"])
  }
}

web.load(URLRequest(url: startURL, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData))
print("wks ready, workdir \(workdir.path)")
fflush(stdout)
let cmdFile = workdir.appendingPathComponent("cmd.json")
var lastBeat = Date()
while true {
  RunLoop.main.run(until: Date().addingTimeInterval(0.05))
  if !busy, let data = try? Data(contentsOf: cmdFile) {
    try? FileManager.default.removeItem(at: cmdFile)
    if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { handle(obj) }
  }
  if !busy && Date().timeIntervalSince(lastPing) > 1.0 { lastPing = Date(); web.evaluateJavaScript("window.__ping = (window.__ping||0) + 1", completionHandler: nil) }
  if Date().timeIntervalSince(lastBeat) > 30 { lastBeat = Date(); try? "alive".write(to: workdir.appendingPathComponent("alive"), atomically: true, encoding: .utf8) }
}
