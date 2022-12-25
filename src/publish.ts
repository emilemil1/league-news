import child_process from "child_process";
import fs from "fs";

fs.mkdirSync("dist/webpage/content", {
    recursive: true
});
fs.readdirSync("dist/content", { encoding: "utf-8" })
    .filter(filename => filename.endsWith("compressed.json"))
    .forEach(filename => fs.copyFileSync("dist/content/" + filename, "dist/webpage/content/" + filename));

child_process.execSync('git add dist');

try {
    child_process.execSync('git commit -m "automatic refresh"');
} catch (e) {
    console.log("No changes.");
}

try {
    console.log("Publishing to master...");
    child_process.execSync('git push');
} catch (e) {
    console.log("No changes.");
}

try {
    console.log("Publishing to gh-pages...");
    child_process.execSync('git subtree push --prefix dist/webpage league-news gh-pages');
} catch (e) {
    console.log("No changes.");
}