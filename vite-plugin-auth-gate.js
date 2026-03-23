import { loadEnv } from 'vite';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';

function buildInjectionScript(env) {
    const flags = [];
    const pocketbaseUrl = env.POCKETBASE_URL;

    if (pocketbaseUrl) {
        flags.push(`window.__POCKETBASE_URL__=${JSON.stringify(pocketbaseUrl)}`);
    }

    return flags.length > 0 ? `<script>${flags.join(';')};</script>` : null;
}

export default function authGatePlugin() {
    let env = {};

    return {
        name: 'auth-gate',

        config(_, { mode }) {
            env = loadEnv(mode, process.cwd(), '');
        },

        transformIndexHtml(html) {
            const scriptTag = buildInjectionScript(env);
            return scriptTag ? html.replace('</head>', `${scriptTag}\n</head>`) : html;
        },

        configurePreviewServer(server) {
            const configScript = buildInjectionScript(env);
            const distDir = join(process.cwd(), 'dist');
            const indexPath = join(distDir, 'index.html');

            let indexHtml = null;
            if (existsSync(indexPath)) {
                indexHtml = readFileSync(indexPath, 'utf-8');
                if (configScript) {
                    indexHtml = indexHtml.replace('</head>', `${configScript}\n</head>`);
                }
            }

            server.middlewares.use((req, res, next) => {
                if (req.url.split('?')[0] === '/health') {
                    res.end('OK');
                    return;
                }
                next();
            });

            if (indexHtml) {
                server.middlewares.use((req, res, next) => {
                    const url = req.url.split('?')[0];
                    const ext = extname(url);

                    if (!ext || ext === '.html') {
                        res.setHeader('Content-Type', 'text/html');
                        res.end(indexHtml);
                        return;
                    }
                    next();
                });
            }
        },
    };
}

