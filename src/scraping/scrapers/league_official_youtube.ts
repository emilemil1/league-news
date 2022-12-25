import { ScrapeOptions, Scraper, ScrapeResult } from "./scraper.js";
import { google, youtube_v3 } from "googleapis";

type VideoId = string;

type Content = {
    videos: Record<VideoId, Date>;
    titles: Record<VideoId, string>;
};

export default class OfficialYouTubeScraper extends Scraper<Content> {
    initContent(): Content {
        return {
            videos: {},
            titles: {}
        };
    }

    async findAndProcessVideos(newContent: Content, oldContent: Content, client: youtube_v3.Youtube, scrapeOptions: ScrapeOptions) {
        const playlistId = "UU2t5bjwHdUX4vM2g8TRDq5g";
        let paginationToken: string | undefined;

        do {
            const response = (await client.playlistItems.list({
                playlistId: playlistId,
                part: [ "snippet" ],
                maxResults: 100,
                pageToken: paginationToken
            }));
            paginationToken = response.data.nextPageToken ?? undefined;
            const videos = response.data.items!;

            for (const video of videos) {
                if (new Date(video.snippet?.publishedAt!) < scrapeOptions.maxAge) {
                    return;
                }
                newContent.videos[ video.id! ] = new Date(video.snippet?.publishedAt!);
                newContent.titles[ video.id! ] = video.snippet?.title!;
                if (Object.values(newContent).length === scrapeOptions.maxEntries) {
                    return;
                }
            }
        } while (paginationToken !== undefined);
    }


    async scrape(oldContent: Content, scrapeOptions: ScrapeOptions): Promise<ScrapeResult<Content>> {
        const newContent = this.initContent();
        const client = google.youtube({
            version: "v3",
            auth: scrapeOptions.apiKeys.youtube.apiKey
        });

        await this.findAndProcessVideos(newContent, oldContent, client, scrapeOptions);

        const oldEntriesIds = new Set(Object.keys(oldContent.videos));
        const newEntries = Object.keys(newContent.videos).filter(key => !oldEntriesIds.has(key)).length;

        return {
            content: newContent,
            newEntries,
            totalEntries: Object.keys(newContent.videos).length
        };
    }

    compress(content: Content) {
        const compressed = [];
        for (const videoId in content.videos) {
            compressed.push({
                id: videoId,
                date: content.videos[ videoId ],
                title: content.titles[ videoId ]
            });
        }
        compressed.sort((a, b) => a.date.getTime() - b.date.getTime());
        return compressed;
    }
}