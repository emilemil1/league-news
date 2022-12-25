export type ApiKeys = {
    twitter: {
        bearerToken: string;
    };
    reddit: {
        clientId: string;
        clientSecret: string;
        username: string;
        password: string;
    };
    youtube: {
        apiKey: string;
    };
};

export type ScrapeResult<C> = {
    content: C;
    newEntries: number;
    totalEntries: number;
};

export type ScrapeOptions = {
    apiKeys: ApiKeys;
    maxEntries: number;
    maxAge: Date;
};

export abstract class Scraper<C> {
    abstract initContent(): C;
    abstract scrape(oldContent: C, options: ScrapeOptions): Promise<ScrapeResult<C>>;
    abstract compress(content: C): unknown[];
}