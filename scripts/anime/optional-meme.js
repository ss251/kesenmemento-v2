// meme-model.js is optional. A literal import('./meme-model.js') fails the bundle when the
// file is absent, and a specifier the bundler cannot see becomes a browser request that 404s
// (a console error). This plugin serves an empty module instead. A tree that has the file
// bundles that file, and the picker then lists メメ.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function optionalMemePlugin(root) {
  const abs = join(root, 'src/anime/play/avatar/meme-model.js');
  return {
    name: 'klc-optional-meme',
    setup(build) {
      build.onResolve({ filter: /^\.\/meme-model\.js$/ }, () => {
        if (existsSync(abs)) return { path: abs };
        return { path: 'meme-model.js', namespace: 'klc-meme-absent' };
      });
      build.onLoad({ filter: /.*/, namespace: 'klc-meme-absent' }, () => ({
        contents: 'export {};\n',
        loader: 'js',
      }));
    },
  };
}
