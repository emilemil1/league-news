import fs from "fs";
import LeagueDevRedditScraper from "./scrapers/league_dev_reddit.js";
import LeagueDevTwitterScraper from "./scrapers/league_dev_twitter.js";
import OfficialArticlesScraper from "./scrapers/league_official_articles.js";
import OfficialYouTubeScraper from "./scrapers/league_official_youtube.js";
import { ApiKeys, ScrapeOptions, Scraper } from "./scrapers/scraper.js";

function getApiKeys(): ApiKeys {
    if (!fs.existsSync("./apiKeys.json")) {
        console.log("apiKeys.json does not exist and has been generated with dummy values.");
        fs.writeFileSync("./apiKeys.json", JSON.stringify({
            twitter: {
                bearerToken: "twitterBearerToken"
            },
            reddit: {
                clientId: "redditClientId",
                clientSecret: "redditClientSecret",
                username: "redditUsername",
                password: "redditPassword"
            },
            youtube: {
                apiKey: "youtubeApiKey"
            }
        }, undefined, 4));
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync("./apiKeys.json", { encoding: "utf-8" }));
}

function getOldContent(contentPath: string): unknown {
    const dateFormat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
    try {
        return JSON.parse(fs.readFileSync(contentPath, { encoding: "utf-8" }), (key, value) => {
            if (typeof value === "string" && dateFormat.test(value)) {
                return new Date(value);
            }
            return value;
        });
    } catch (ex) {
        return undefined;
    }
}

async function main() {
    console.log("=== League of Legends News Scraper ==");
    console.log();
    const startTime = new Date().getTime();

    const scrapeOptions: ScrapeOptions = {
        maxEntries: 100,
        maxAge: new Date(),
        apiKeys: getApiKeys()
    };
    scrapeOptions.maxAge.setDate(scrapeOptions.maxAge.getDate() - 60);

    const scrapers: Record<string, Scraper<unknown>> = {
        official_articles: new OfficialArticlesScraper(),
        league_dev_twitter: new LeagueDevTwitterScraper(),
        league_dev_reddit: new LeagueDevRedditScraper(),
        official_youtube: new OfficialYouTubeScraper()
    };

    let newEntriesTotal = 0;
    for (const scraper in scrapers) {
        process.stdout.write(`Scraping '${scraper}'... `);
        const contentPath = `./dist/content/${scraper}.json`;
        const compressedPath = `./dist/content/${scraper}_compressed.json`;
        const oldContent = getOldContent(contentPath) ?? scrapers[ scraper ].initContent();

        try {
            const result = await scrapers[ scraper ].scrape(oldContent, scrapeOptions);
            fs.writeFileSync(contentPath, JSON.stringify(result.content, undefined, 4));
            process.stdout.write(`${result.newEntries} new entries (${result.totalEntries} total)\n`);
            newEntriesTotal += result.newEntries;
            console.log("Compressing...");
            const compressed = scrapers[ scraper ].compress(result.content);
            fs.writeFileSync(compressedPath, JSON.stringify({ data: compressed }, undefined, 4));
        } catch (ex) {
            process.stdout.write(`\n`);
            console.error(ex);
            continue;
        }
    }

    console.log();
    console.log("Scraping complete");
    console.log(`${newEntriesTotal} new entries`);
    const endTime = new Date().getTime();
    const elapsed = Math.round((endTime - startTime) / 1000);
    console.log(`Execution time: ${elapsed} seconds`);
}

try {
    await main();
} catch (ex) {
    console.error("Unhandled exception thrown");
    console.error(ex);
}
