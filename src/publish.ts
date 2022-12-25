import child_process from "child_process";
import fs from "fs";

child_process.execSync('git add .');
child_process.execSync('git commit -m "automatic refresh"');
child_process.execSync('git push');

fs.mkdirSync("dist/webpage/content");
fs.readdirSync("dist/content", "utf-8")
    .filter(filename => filename.endsWith("compressed"))
    .forEach(filename => fs.copyFileSync("dist/content/" + filename, "dist/webpage/content/" + filename));

child_process.execSync('git subtree push --prefix dist/webpage origin gh-pages');