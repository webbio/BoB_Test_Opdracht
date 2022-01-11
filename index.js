// Imports
import fetch from 'node-fetch';
import cheerio from "cheerio";
import valid_url from "valid-url";
import Stopwatch from "statman-stopwatch";

// Retrieve domain from node command
const domain = process.argv[2];

main();

async function main() {
    // Retrieve all URLs and remove duplicates from arrays
    let URLs = await getURLs()
    URLs = removeDuplicatesFromAllURLObject(URLs);
    console.log(URLs)

    // Retrieve statistics
    let URLStatistics = await getURLStatistics(URLs);
    console.log(URLStatistics);

}

async function getURLs() {
    // Initialization of object used to track all URLs throughout the recursive crawl
    let allURLs = {
        allInternalURLs: [],
        allExternalURLs: [],
        allUnscrapedInternalURLs: [],
        allScrapedInternalURLs: [domain]
    }
    await getPageURLs(allURLs, domain);
    return allURLs
}

async function getPageURLs(allURLs, pageUrl) {
    // Local variables for this iteration of (potential) recursion
    let localAllURLs = allURLs
    let pageInternalURLs = [];
    let pageExternalURLs = [];

    // This array always still has to be scraped
    let pageUnscrapedInternalURLs = [];
    
    // Retrieve HTML
    console.log(`Scraping ${pageUrl}`);
    const pageHtml = await (await fetch(pageUrl)).text();
    if (pageHtml) {
        // Parse HTML and find all <a/> elements amd extract href attribute
        const $ = cheerio.load(pageHtml);
        const linkObjects = $("a");
        let links = [];
        linkObjects.each((index, element) => {
            links.push($(element).attr("href"))
        })
        links.forEach(link => {
            // First validate URL and exclude mailto and tel hrefs
            if (valid_url.isUri(link) && (!link.includes("mailto") && !link.includes("tel"))) {
                // Determine if link is internal or external
                if (isUrlInternal(link)) {
                    pageInternalURLs.push(link);
                    if (!localAllURLs.allScrapedInternalURLs.includes(link)) {
                        pageUnscrapedInternalURLs.push(link);
                    }
                } else {
                    pageExternalURLs.push(link);
                }
            }
        })
    } else {
        throw Error("Something went wrong in Link retrieval");
    }

    // Push page URLs to allURLs object
    localAllURLs.allExternalURLs = removeDuplicatesFromArray(localAllURLs.allExternalURLs.concat(pageExternalURLs));
    localAllURLs.allInternalURLs = removeDuplicatesFromArray(localAllURLs.allInternalURLs.concat(pageInternalURLs));
    localAllURLs.allUnscrapedInternalURLs = removeDuplicatesFromArray(localAllURLs.allUnscrapedInternalURLs.concat(pageUnscrapedInternalURLs));

    await Promise.all(
        localAllURLs.allUnscrapedInternalURLs.map(async (url) => {
            // Only scrape new URLs
            if(!localAllURLs.allScrapedInternalURLs.includes(url)){
        if(!localAllURLs.allScrapedInternalURLs.includes(url)){ 
            if(!localAllURLs.allScrapedInternalURLs.includes(url)){
                localAllURLs.allUnscrapedInternalURLs = localAllURLs.allUnscrapedInternalURLs.splice(url);
                localAllURLs.allScrapedInternalURLs.push(url);
                try {
                    localAllURLs = await getPageURLs(localAllURLs, url)
                } catch (error) {
                    console.log(error)
                }
            }
        })
    )
    return localAllURLs
}

function isUrlInternal(url) {
    // First trim the domain to domain and extension
    let trimmedDomain = domain.replace("https://", "").replace("http://", "").replace("www.", "");
    if (url.includes(trimmedDomain)) {
        // Relative path or domain in URL signifies Internal URL
        return true;
    } else {
        // If not, it's an external URL
        return false;
    }
}

function removeDuplicatesFromAllURLObject(allURLs) {
    let localAllURLs = allURLs;
    localAllURLs.allExternalURLs = removeDuplicatesFromArray(localAllURLs.allExternalURLs);
    localAllURLs.allInternalURLs = removeDuplicatesFromArray(localAllURLs.allInternalURLs);
    localAllURLs.allUnscrapedInternalURLs = removeDuplicatesFromArray(localAllURLs.allUnscrapedInternalURLs);
    localAllURLs.allScrapedInternalURLs = removeDuplicatesFromArray(localAllURLs.allScrapedInternalURLs);
    return localAllURLs;
}

function removeDuplicatesFromArray(array) {
    const uniqueArray = array.filter(function(elem, pos) {
        return array.indexOf(elem) == pos;
    })
    return uniqueArray;
}

async function getURLStatistics(allURLs) {
    console.log("Retrieving URL statistics..")
    let URLStatisticsObject = {
        amountOfInternalURLs: "",       // Number of Internal URLs
        amountOfExternalURLs: "",       // Number of External URLs
        amountOfSuccesfullURLs: "",     // Requests with 2xx response
        amountOfErrorURLs: "",          // Requests with 3xx, 4xx or 5xx response
        averageLoadTime: "",            // Average loadtime in ms of succesfull requests
        averagePayload: "",             // Average oayload in KB of succesfull requests
        averageURLsLocatedOnURL: "",    // All internal pages with 
        percentageSuccesfull: ""        // Percentage of 2xx responses of total requests
    }

    // Internal and External URLS
    URLStatisticsObject.amountOfInternalURLs = allURLs.allInternalURLs.length;
    URLStatisticsObject.amountOfExternalURLs = allURLs.allExternalURLs.length;

    // Get Request stats
    // TODO: Incorporate this in crawl process to circumvent double requests
    let requestsStats = await getRequestStats(allURLs);

    URLStatisticsObject.amountOfSuccesfullURLs = requestsStats.amountOfSuccesfullURLs;
    URLStatisticsObject.amountOfErrorURLs = requestsStats.amountOfErrorURLs;
    URLStatisticsObject.averageLoadTime = requestsStats.averageLoadTime;
    URLStatisticsObject.averagePayload = requestsStats.averagePayload;
    URLStatisticsObject.percentageSuccesfull = requestsStats.amountOfSuccesfullURLs / (requestsStats.amountOfErrorURLs + requestsStats.amountOfSuccesfullURLs) * 100;

    return URLStatisticsObject;
}

async function getRequestStats(allURLs) {
    let loadTimes = [];
    let payLoads = [];
    let succesCounter = 0;
    let failCounter = 0;

    let localAllURLs = allURLs.allInternalURLs.concat(allURLs.allExternalURLs);
    
    await Promise.all(
        localAllURLs.map(async(url) => {
            try {
                const stopwatch = new Stopwatch();
                stopwatch.start();
                const response = await fetch(url);
                stopwatch.stop();
                payLoads.push(getBinarySize(await response.text()));
                loadTimes.push(stopwatch.read());
                succesCounter++;
            } catch(error) {
                failCounter++;
            }
        })
    )

    // Initialisation of return object
    let statsObject = {
        amountOfSuccesfullURLs: succesCounter,
        amountOfErrorURLs: failCounter,
        averageLoadTime: Math.round(getAverageFromArray(loadTimes)),
        averagePayload: Math.round(getAverageFromArray(payLoads))
    };

    return statsObject;
}

function getBinarySize(string) {
    return Buffer.byteLength(string, "utf8");
}

function getAverageFromArray(array) {
    const sum = array.reduce((a, b) => a + b, 0);
    const avg = (sum / array.length) || 0;
    return avg;
}