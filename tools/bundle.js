#!/usr/bin/env node

(async function () {
    const args = process.argv.slice(2)

    function consumeArg(arg) {
        const index = args.indexOf(arg)
        if (index !== -1) {
            args.splice(index, 1)
            return true
        }
        return false
    }

    const dev = consumeArg("--dev")
    const dist = consumeArg("--dist")

    if ((!dev && !dist)) {
        console.error("Must specify --dev or --dist")
        process.exit(1)
    }

    if (args.length > 0) {
        console.error("Unknown arguments: " + args.join(" "))
        process.exit(1)
    }

    if (dev) {
        console.log("Building dev bundle")
        await build(false)
    }

    if (dist) {
        console.log("Building dist bundle")
        await build(true)
    }

})()

/**
 * @param {boolean} dist 
 * @returns {Promise<string>}
 */
function build(dist) {

    const minify = dist
    const suffix = dist ? "" : "-dev"
    const outHtmlFile = dist ? "index-dist.html" : "index.html"

    const bundleFile = `simulator/lib/bundle${suffix}.js`

    const esbuild = require("esbuild")
    return esbuild
        .build({
            minify,
            bundle: true,
            sourcemap: true,
            loader: {
                ".html": "text",
                ".css": "text",
                ".icon.svg": "text",
                ".svg": "text",
            },
            logLevel: "info",
            entryPoints: ["simulator/src/LogicEditor.ts"],
            outfile: bundleFile,
        })
        .then(() => {
            // compute md5 hash of the bundle
            const fs = require("fs")
            const crypto = require("crypto")
            const hash = crypto.createHash("md5")
            const bundle = fs.readFileSync(bundleFile)
            hash.update(bundle)
            const md5 = hash.digest("hex")
            // console.log("MD5 hash of bundle: " + md5)

            // insert md5 hash into index-template.html
            const indexTemplate = fs.readFileSync("simulator/html/index-template.html", "utf8")
            const index = indexTemplate
                .replaceAll("{{SUFFIX}}", suffix)
                .replaceAll("{{BUNDLE_MD5}}", md5)
            fs.writeFileSync(outHtmlFile, index)
            return outHtmlFile
        })
        .catch((err) => {
            console.error(err)
            process.exit(1)
        });

}

