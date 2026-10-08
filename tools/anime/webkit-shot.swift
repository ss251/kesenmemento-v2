// [loader] Screenshots of a page in WebKit (the engine of iOS Safari), without Chrome and without the Chrome lock.
//
//   swiftc -O tools/anime/webkit-shot.swift -o /tmp/webkit-shot
//   /tmp/webkit-shot --url http://127.0.0.1:9435/ --w 390 --h 844 --scale 3 --steps steps.json
//   steps.json: [ { "js": "document.body.classList.add('loaded')", "wait": 600, "out": "/tmp/a.png" }, ... ]   (js and out are optional; each step: js, wait, then the snapshot)
//   --out a.png   a single snapshot after the load and --wait ms (default 900)
//   --ua iphone   an iPhone Safari user agent (some pages read it)
//   --onscreen    show the window on the main display while it renders: needed for anything that ANIMATES (WebKit pauses animations in an off-screen window)
//
// What it is for: the look of the loader and the title screen in WebKit (Hiragino Maru Gothic, WebKit's compositing), on any viewport, quickly. What it is NOT: a phone. There is no touch,
// no safe area (env(safe-area-inset-*) is 0) and prefers-reduced-motion follows the Mac's setting; those are checked in Chrome through the gate (tools/anime/loader-check.mjs) and on the iPhone.
// --scale N renders at N device pixels per CSS pixel (WKWebView.pageZoom): the layout is still w x h CSS pixels, so media queries match the phone.
import AppKit
import WebKit

struct Step: Decodable { var js: String?; var wait: Double?; var out: String? }

var url = ""
var out: String? = nil
var steps: [Step] = []
var w: CGFloat = 800, h: CGFloat = 600, scale: CGFloat = 1
var waitMs: Double = 900
var ua: String? = nil
var timeout: TimeInterval = 120
var onscreen = false

var it = CommandLine.arguments.dropFirst().makeIterator()
while let a = it.next() {
  switch a {
  case "--url": url = it.next() ?? ""
  case "--out": out = it.next()
  case "--w": w = CGFloat(Double(it.next() ?? "") ?? 800)
  case "--h": h = CGFloat(Double(it.next() ?? "") ?? 600)
  case "--scale": scale = CGFloat(Double(it.next() ?? "") ?? 1)
  case "--wait": waitMs = Double(it.next() ?? "") ?? 900
  case "--timeout": timeout = Double(it.next() ?? "") ?? 120
  case "--onscreen": onscreen = true
  case "--ua": if it.next() == "iphone" { ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" }
  case "--steps":
    if let p = it.next(), let d = FileManager.default.contents(atPath: p) { steps = (try? JSONDecoder().decode([Step].self, from: d)) ?? [] }
  default: print("unknown argument \(a)"); exit(2)
  }
}
if url.isEmpty { print("usage: webkit-shot --url <url> [--out a.png | --steps steps.json] [--w 390 --h 844 --scale 3 --wait 900 --ua iphone]"); exit(2) }
if steps.isEmpty, let o = out { steps = [Step(js: nil, wait: waitMs, out: o)] }

final class Nav: NSObject, WKNavigationDelegate {
  var done = false
  func webView(_ w: WKWebView, didFinish n: WKNavigation!) { done = true }
  func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) { print("load failed: \(e)"); exit(3) }
  func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { print("load failed: \(e)"); exit(3) }
}

func spin(until cond: () -> Bool, timeout: TimeInterval = 60, what: String = "") {
  let t0 = Date()
  while !cond() {
    RunLoop.main.run(until: Date().addingTimeInterval(0.02))
    if Date().timeIntervalSince(t0) > timeout { print("timeout \(what)"); exit(4) }
  }
}
func sleepMs(_ ms: Double) { let t0 = Date(); while Date().timeIntervalSince(t0) * 1000 < ms { RunLoop.main.run(until: Date().addingTimeInterval(0.01)) } }

let app = NSApplication.shared
app.setActivationPolicy(onscreen ? .accessory : .prohibited)
app.finishLaunching()
let cfg = WKWebViewConfiguration()
let px = NSRect(x: 0, y: 0, width: w * scale, height: h * scale)
let web = WKWebView(frame: px, configuration: cfg)
web.pageZoom = scale
if let ua = ua { web.customUserAgent = ua }
// an off-screen window is not "visible" to WebKit: it pauses CSS animations and Web Animations there. --onscreen puts the window at the top left of the main display (briefly), where they run.
let win = NSWindow(contentRect: NSRect(x: onscreen ? 0 : -30000, y: onscreen ? 0 : -30000, width: px.width, height: px.height), styleMask: [.borderless], backing: .buffered, defer: false)
if onscreen { win.level = .floating }
win.contentView = web
if onscreen { win.makeKeyAndOrderFront(nil); app.activate(ignoringOtherApps: false) } else { win.orderFrontRegardless() }
let nav = Nav()
web.navigationDelegate = nav
if url.hasPrefix("http") { web.load(URLRequest(url: URL(string: url)!)) } else { let u = URL(fileURLWithPath: url); web.loadFileURL(u, allowingReadAccessTo: u.deletingLastPathComponent()) }
spin(until: { nav.done }, timeout: timeout, what: "load")

for (i, s) in steps.enumerated() {
  if let js = s.js, !js.isEmpty {
    var res: Any? = nil, fin = false
    web.callAsyncJavaScript("return (async () => { \(js) })()", arguments: [:], in: nil, in: .page) { r in
      switch r { case .success(let v): res = v; case .failure(let e): res = "js error: \(e)" }
      fin = true
    }
    spin(until: { fin }, timeout: 60, what: "js \(i)")
    if let r = res, !(r is NSNull) { print("step \(i): \(r)") }
  }
  sleepMs(s.wait ?? 0)
  if let o = s.out {
    var img: NSImage? = nil, got = false
    let sc = WKSnapshotConfiguration()
    web.takeSnapshot(with: sc) { image, err in
      if let e = err { print("snapshot failed: \(e)") }
      img = image; got = true
    }
    spin(until: { got }, timeout: 30, what: "snapshot \(i)")
    if let im = img, let tiff = im.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) {
      try? FileManager.default.createDirectory(atPath: (o as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
      try? png.write(to: URL(fileURLWithPath: o))
      print("saved \(o) \(rep.pixelsWide)x\(rep.pixelsHigh)")
    }
  }
}
exit(0)
