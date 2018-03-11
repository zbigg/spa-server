
/*
list root /$$/index.html

    an host each index.html as

    /$$/... SPA

problems
    most SPA are not relocatable outside of
    domain root

    script tags
        /dist/foo.bundle.js

    resources / images
        referer!!!
        if the referere matches domain
        one can set the relative pah
*/

import * as express from 'express';
import * as glob from "glob";
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs';

const debug = require('debug')('SpaServer');

interface AppInfo {
    prefix: string,          // '/foo-bar'
    rewrite_target: string   // '/opt/site/foo-bar/index.html
    root: string             // '/opt/site/foo-bar'
};

export interface SpaServerOptions {

}

export function SpaServer(folderPath: string, options?: SpaServerOptions) {

    let apps: Array<AppInfo> = [];
    findApps(folderPath)
        .then(foundApps => {
            apps = foundApps
        })
        .catch(error => {
            console.log(`SpaServer: unable to find apps in ${folderPath}`, error);
        });

    function renderAppList(res: express.Response) {
        res.contentType('text/html');
        res.send(`
            <html>
                <body>
                    <ul>
                        ${apps.map(e => (`
                            <li>
                                <a href="${e.prefix}">${e.prefix}</a>
                            </li>
                        `)).join('\n')}
                    </ul>
                </body>
            </html>
        `)
    }

    function sendFile(res: express.Response, filePath: string, app: AppInfo) {
        var sendfile_opions = {
            root: path.resolve(app.root)
        }
        debug('[%s] sending %s', app.prefix, filePath);
        res.sendFile(filePath, sendfile_opions)
    }

    function renderAppUrl(req: express.Request, res: express.Response, pathname: string, app: AppInfo) {
        if( pathname === '/' ) {
            sendFile(res, 'index.html', app);
            return;
        }
        const filePath = path.join(app.root) + pathname;
        debug('[%s] %s(%s): trying', app.prefix, pathname, filePath);
        fs.exists(filePath, (exists) => {
            if(exists) {
                sendFile(res, pathname, app);
            } else if( !path.extname(filePath) && req.accepts('html') ) {
                // rewrite only if non-existing extension-less file requested
                // and client accepts HTML
                debug('[%s] %s(%s): rewrite', app.prefix, pathname);
                sendFile(res, 'index.html', app);
            } else {
                debug('[%s] %s(%s): not found!', app.prefix, pathname, filePath);
                res.status(404).send('not found');
            }
        })
    }
    return (req: express.Request, res: express.Response) => {
        console.log('req?: %s', req.path);
        if( req.path === '/' ) {
            debug('%s: sending', req.path);
            renderAppList(res);
            return;
        }
        const matchingApp = apps.find((e) => {
            return req.path.startsWith(e.prefix);
        });
        if( matchingApp ) {
            const newPath = req.path.substr(matchingApp.prefix.length + 1) || '/';
            debug('%s: basic app match', newPath);
            renderAppUrl(req, res, newPath, matchingApp);
            return;
        }
        const referer = req.get('Referer');
        if( referer !== undefined ) {
            const refererPathname = url.parse(referer).pathname;
            const refererMachingApp = apps.find((e) => {
                return refererPathname.startsWith(e.prefix);
            });
            if( refererMachingApp ) {
                debug('%s: referer app match', req.path);
                renderAppUrl(req, res, req.path, refererMachingApp);
                return
            }
        }
        debug('%s: no app, not found', req.path);
        res.status(404).send('not found');
    }
}

export function findApps(folderPath: string): Promise<Array<AppInfo>> {
    return new Promise<Array<AppInfo>>((resolve, reject) => {
        glob(path.join(folderPath, '*', 'index.html'), (err, matches) => {
            if( err ) {
                reject(err);
                return;
            }
            const apps = matches.map((match) => {
                const root = path.dirname(match);
                const prefix = '/' + path.basename(root);
                return {
                    prefix,
                    rewrite_target: match,
                    root
                }
            })
            console.log(apps);
            resolve(apps);
        })
    });
}

var app = express();
app.use('/', SpaServer('./spa-test'));
app.use((err, req, res, next) => {
    console.log('failed', req.path)
    console.error(err)
})
app.listen(8080, 'localhost')
