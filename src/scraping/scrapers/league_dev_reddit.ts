import { ScrapeOptions, Scraper, ScrapeResult } from "./scraper.js";
import Snoowrap from "snoowrap";

type CommentId = string;
type PostId = string;
type RiotVisibility = "Visible" | "Invisible" | "Uncategorized";

type Content = {
    comments: Record<CommentId, Date>;
    posts: Record<CommentId, PostId>;
    authors: Record<CommentId, string>;
    subreddit: Record<CommentId | PostId, string>;
    riotUsers: Record<string, RiotVisibility>;
};

export default class LeagueDevRedditScraper extends Scraper<Content> {
    riotNameRegex = /\[([^\]]*)\]$/gm;
    validSubreddits = /^leagueoflegends$|^aram$|^.*mains$/gm;
    initContent(): Content {
        return {
            comments: {},
            posts: {},
            authors: {},
            subreddit: {},
            riotUsers: {}
        };
    }

    processComment(comment: Snoowrap.Comment, newContent: Content, oldContent: Content) {
        const result = {
            inherited: false,
            newInformation: false
        };

        newContent.comments[ comment.id ] = new Date(comment.created_utc * 1000);

        if (oldContent.comments?.[ comment.id ] !== undefined) {
            newContent.authors[ comment.id ] = oldContent.authors?.[ comment.id ];
            newContent.subreddit[ comment.id ] = oldContent.subreddit?.[ comment.id ];
            const postId = oldContent.posts?.[ comment.id ];
            if (postId !== undefined) {
                newContent.posts[ comment.id ] = postId;
            }
            result.inherited = true;
        }

        const postId = comment.link_id.split("_")[ 1 ];
        const parentId = comment.parent_id.split("_")[ 1 ];

        if (newContent.authors[ comment.id ] === undefined) {
            newContent.authors[ comment.id ] = comment.author.name;
            result.newInformation = true;
        }

        if (newContent.subreddit[ comment.id ] === undefined) {
            newContent.subreddit[ comment.id ] = comment.subreddit.display_name;
            result.newInformation = true;
        }

        if (newContent.posts[ comment.id ] === undefined) {
            const postId = comment.link_id.split("_")[ 1 ];
            newContent.posts[ comment.id ] = postId;
            result.newInformation = true;
        }

        return result;
    }

    async findAndProcessComments(user: string, newContent: Content, oldContent: Content, client: Snoowrap, scrapeOptions: ScrapeOptions) {
        const results: { inherited: boolean; }[] = [];
        let paginationToken: string | undefined;
        let count = 0;
        do {
            const response = await client.getUser(user).getComments({
                limit: 100,
                after: paginationToken,
                count
            });
            count += response.length;
            paginationToken = response[ response.length - 1 ]?.name;

            for (const comment of response ?? []) {
                if (new Date(comment.created_utc * 1000) < scrapeOptions.maxAge) {
                    return results;
                }
                if (!this.validSubreddits.test(comment.subreddit.display_name.toLowerCase())) {
                    continue;
                }
                const result = this.processComment(comment, newContent, oldContent);
                results.push(result);
                if (results.length === scrapeOptions.maxEntries) {
                    return results;
                }
            }
        } while (paginationToken !== undefined);

        return results;
    }

    async findRiotUsers(client: Snoowrap, maxDate: Date): Promise<Record<string, RiotVisibility>> {
        const riotUsers: Record<string, RiotVisibility> = {};
        let paginationToken: string | undefined;
        let count = 0;
        let lastDate: Date | undefined = undefined;
        do {
            const response: Snoowrap.Listing<Snoowrap.Submission> = await client.getSubreddit("leagueofriot").getNew({
                limit: 100,
                after: paginationToken,
                count
            });
            count += response.length;
            paginationToken = response[ response.length - 1 ]?.name;

            for (const post of response ?? []) {
                lastDate = new Date(post.created_utc * 1000);
                const name = this.riotNameRegex.exec(post.title)?.[ 1 ] ?? undefined;
                this.riotNameRegex.lastIndex = 0;
                if (name === undefined) {
                    throw new Error("Could not parse leagueofriot title: " + post.title);
                }
                riotUsers[ name ] = "Uncategorized";
            }
            if (lastDate === undefined || lastDate.getTime() < maxDate.getTime()) {
                break;
            }
        } while (paginationToken !== undefined);
        return riotUsers;
    }

    async scrape(oldContent: Content, scrapeOptions: ScrapeOptions): Promise<ScrapeResult<Content>> {
        const newContent = this.initContent();
        const credentialsResponse = await fetch("https://www.reddit.com/api/v1/access_token", {
            method: "POST",
            body: "grant_type=client_credentials",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": `Basic ${Buffer.from(scrapeOptions.apiKeys.reddit.clientId + ":" + scrapeOptions.apiKeys.reddit.clientSecret, "utf-8").toString("base64")}`
            }
        });
        const credentials = await credentialsResponse.json();
        const client = new Snoowrap({
            userAgent: "windows:ophion.leaguenews:0.0.1 (by /u/emilemil1)",
            accessToken: credentials.access_token
        });

        const commentsArray = Object.values(oldContent.comments);
        commentsArray.sort((d1, d2) => d2.getTime() - d1.getTime());
        let latestCommentDate = commentsArray[ 0 ];
        if (latestCommentDate === undefined) {
            latestCommentDate = new Date();
            latestCommentDate.setDate(latestCommentDate.getDate() - 3);
        }

        newContent.riotUsers = {
            ...(await this.findRiotUsers(client, latestCommentDate)),
            ...oldContent.riotUsers
        };

        const promises = [];
        for (const user in newContent.riotUsers) {
            promises.push(this.findAndProcessComments(user, newContent, oldContent, client, scrapeOptions));
        }
        const results = (await Promise.all(promises)).flatMap(arr => arr);

        const newEntries = results.filter(result => result.inherited === false).length;

        return {
            content: newContent,
            newEntries: newEntries,
            totalEntries: results.length
        };
    }

    compress(content: Content) {
        const compressed = [];
        for (const commentId in content.comments) {
            compressed.push({
                id: commentId,
                date: content.comments[ commentId ],
                author: content.authors[ commentId ],
                visibility: content.riotUsers[ content.authors[ commentId ] ],
                subreddit: content.subreddit[ commentId ],
                post: content.posts[ commentId ]
            });
        }
        compressed.sort((a, b) => a.date.getTime() - b.date.getTime());
        return compressed;
    }
}