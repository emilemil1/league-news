import { ScrapeOptions, Scraper, ScrapeResult } from "./scraper.js";

type PageData = {
    result: {
        data: {
            allArticles: {
                edges: Array<{
                    node: {
                        uid: string;
                        title: string;
                        date: string;
                        description: string;
                        external_link: string;
                        youtube_link: string;
                        url: {
                            url: string;
                        };
                        banner: {
                            url: string;
                        };
                    };
                }>;
            };
        };
    };
};

type Article = {
    id: string;
    date: Date;
    title: string;
    description: string;
    url: string;
    image: string;
};

type Content = {
    articles: Article[];
};

export default class OfficialArticlesScraper extends Scraper<Content> {
    url = "https://www.leagueoflegends.com/page-data/en-us/latest-news/page-data.json";

    initContent(): Content {
        return {
            articles: []
        };
    }

    getLink(node: PageData[ "result" ][ "data" ][ "allArticles" ][ "edges" ][ 0 ][ "node" ]): string {
        if (node.external_link !== "") return node.external_link;
        if (node.youtube_link !== "") return node.youtube_link;
        if (node.url?.url !== "") return "https://www.leagueoflegends.com/en-us" + node.url.url;
        throw new Error(`Could not resolve url for node: ${node.uid}`);
    }

    async scrape(oldContent: Content, scrapeOptions: ScrapeOptions): Promise<ScrapeResult<Content>> {
        const pageData: PageData = await (await fetch(this.url)).json();
        const articles: Article[] = pageData.result.data.allArticles.edges.map((edge): Article => {
            return {
                id: edge.node.uid,
                date: new Date(edge.node.date),
                title: edge.node.title,
                description: edge.node.description,
                url: this.getLink(edge.node),
                image: edge.node.banner.url
            };
        }).filter(article => article.date >= scrapeOptions.maxAge).slice(0, scrapeOptions.maxEntries);

        const oldEntriesIds = new Set(oldContent.articles.map(article => article.id));
        const newEntries = articles.filter(article => !oldEntriesIds.has(article.id)).length;

        return {
            content: {
                articles
            },
            newEntries,
            totalEntries: articles.length
        };
    }

    compress(content: Content) {
        return content.articles.map(article => {
            return {
                id: article.id,
                date: article.date,
                title: article.title,
                description: article.description,
                url: article.title,
                image: article.image
            };
        });
    }
}