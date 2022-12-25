import { ScrapeOptions, Scraper, ScrapeResult } from "./scraper.js";
import { Client } from "twitter-api-sdk";

type TweetId = string;
type AuthorId = string;

type Tweet = {
    id: TweetId;
    date: Date;
    isRetweet: boolean;
    mention?: string;
    referencedTweet?: string;
};

type Content = {
    tweets: Record<TweetId, Date>;
    embedCodes: Record<TweetId, string>;
    authors: Record<TweetId, AuthorId>;
    authorAliases: Record<AuthorId, string>;
};

export default class LeagueDevTwitterScraper extends Scraper<Content> {

    initContent(): Content {
        return {
            tweets: {},
            embedCodes: {},
            authors: {},
            authorAliases: {}
        };
    }

    extractRiot(name: string, fallback: string): string {
        if (name.toLowerCase().startsWith("riot")) {
            return `Riot ${name.substring(4).trim()}`;
        } else {
            return fallback;
        }
    }

    getAuthor(username: string, nickname: string): string {
        const keywords = [ "riot", "league" ];
        for (const keyword of keywords) {
            if (nickname.toLowerCase().includes(keyword)) {
                return this.extractRiot(nickname, nickname);
            }
        }
        for (const keyword of keywords) {
            if (username.toLowerCase().includes(keyword)) {
                return this.extractRiot(username, `@${username}`);
            }
        }
        return `${nickname} (@${username})`;
    }

    async processTweet(tweet: Tweet, newContent: Content, oldContent: Content, client: Client) {
        const promises = [];
        const result = {
            inherited: false
        };

        newContent.tweets[ tweet.id ] = tweet.date;

        //Initialize with old values
        if (oldContent.tweets?.[ tweet.id ] !== undefined) {
            newContent.authors[ tweet.id ] = oldContent.authors?.[ tweet.id ];
            newContent.authorAliases[ newContent.authors[ tweet.id ] ] = oldContent.authorAliases?.[ newContent.authors[ tweet.id ] ];
            newContent.embedCodes[ tweet.id ] = oldContent.embedCodes?.[ tweet.id ];
            result.inherited = true;
        }

        //Author
        if (newContent.authors[ tweet.id ] === undefined) {
            if (!tweet.isRetweet) {
                newContent.authors[ tweet.id ] = "1405644969675681794";
            } else if (tweet.mention !== undefined) {
                newContent.authors[ tweet.id ] = tweet.mention;
            } else if (tweet.referencedTweet !== undefined) {
                const promise = client.tweets.findTweetById(tweet.referencedTweet, {
                    "tweet.fields": [ "author_id" ]
                }).then(response => newContent.authors[ tweet.id ] = response.data?.author_id!);
                promises.push(promise);
            } else {
                throw new Error("Could not find author");
            }
        }

        //Author alias
        if (newContent.authorAliases[ newContent.authors[ tweet.id ] ] === undefined) {
            const promise = client.users.findUserById(newContent.authors[ tweet.id ])
                .then(response => newContent.authorAliases[ newContent.authors[ tweet.id ] ] = this.getAuthor(response.data?.username!, response.data?.name!));
            promises.push(promise);
        }

        //Embedcode
        if (newContent.embedCodes[ tweet.id ] === undefined) {
            const promise = fetch(`https://publish.twitter.com/oembed?url=https%3A%2F%2Ftwitter.com%2FLoLDev%2Fstatus%2F${tweet.id}&partner=&hide_thread=true`)
                .then(response => response.json())
                .then(json => newContent.embedCodes[ tweet.id ] = json.html);
            promises.push(promise);
        }

        return Promise.all(promises).then(() => result);
    }

    async findAndProcessTweets(newContent: Content, oldContent: Content, client: Client, scrapeOptions: ScrapeOptions) {
        let paginationToken: string | undefined;
        const promises = [];
        do {
            const response = await client.tweets.usersIdTweets("1405644969675681794", {
                max_results: 100,
                "tweet.fields": [ "created_at", "entities", "referenced_tweets" ],
                "pagination_token": paginationToken
            });
            paginationToken = response.meta?.next_token;

            for (const tweet of response.data ?? []) {
                const newTweet: Tweet = {
                    id: tweet.id,
                    date: new Date(tweet.created_at ?? ""),
                    isRetweet: tweet.text.startsWith("RT @"),
                    mention: tweet.entities?.mentions?.[ 0 ]?.id,
                    referencedTweet: tweet?.referenced_tweets?.[ 0 ]?.id
                };
                if (newTweet.date < scrapeOptions.maxAge) {
                    return await Promise.all(promises);
                }
                promises.push(this.processTweet(newTweet, newContent, oldContent, client));
                if (promises.length === scrapeOptions.maxEntries) {
                    await Promise.all(promises);
                }
            }
        } while (paginationToken !== undefined);
        return await Promise.all(promises);
    }

    async scrape(oldContent: Content, scrapeOptions: ScrapeOptions): Promise<ScrapeResult<Content>> {
        const newContent = this.initContent();
        const client = new Client(scrapeOptions.apiKeys.twitter.bearerToken);

        const results = await this.findAndProcessTweets(newContent, oldContent, client, scrapeOptions);

        return {
            content: newContent,
            newEntries: results.filter(result => result.inherited === false).length,
            totalEntries: results.length
        };
    }

    compress(content: Content) {
        const compressed = [];
        for (const tweetId in content.tweets) {
            compressed.push({
                id: tweetId,
                date: content.tweets[ tweetId ],
                author: content.authorAliases[ content.authors[ tweetId ] ],
                embedCode: content.embedCodes[ tweetId ]
            });
        }
        compressed.sort((a, b) => a.date.getTime() - b.date.getTime());
        return compressed;
    }
}