// Imports
import fetch from 'node-fetch';
import cheerio from "cheerio";
import valid_url from "valid-url";

// Retrieve domain from node command
const domain = process.argv[2];

main();

async function main() {
    const response = await fetch(domain);
    console.log(response);
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
                    pageUnscrapedInternalURLs.push(link);
                } else {
                    pageExternalURLs.push(link);
                }
            }
        })
    } else {
        throw Error("Something went wrong in Link retrieval");
    }

    // Push page URLs to allURLs object
    localAllURLs.allExternalURLs = localAllURLs.allExternalURLs.concat(pageExternalURLs);
    localAllURLs.allInternalURLs = localAllURLs.allInternalURLs.concat(pageInternalURLs);
    localAllURLs.allUnscrapedInternalURLs = localAllURLs.allUnscrapedInternalURLs.concat(pageUnscrapedInternalURLs)

    localAllURLs.allUnscrapedInternalURLs.forEach(url => {
        // Only scrape new URLs
        if(!localAllURLs.allScrapedInternalURLs.includes(url)){ 
            localAllURLs.allUnscrapedInternalURLs.splice(url);
            localAllURLs.allScrapedInternalURLs.push(url);
            try {
                localAllURLs = getPageURLs(localAllURLs, url)
            } catch {
                // Error but still continue
            }
        }
    })
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
    // URLStatisticsObject.averageLoadTime = requestsStats.averageLoadTime;
    // URLStatisticsObject.averagePayload = requestsStats.averagePayload;
    URLStatisticsObject.percentageSuccesfull = requestsStats.amountOfSuccesfullURLs / (requestsStats.amountOfErrorURLs + requestsStats.amountOfSuccesfullURLs) * 100;

    return URLStatisticsObject;
}

async function getRequestStats(allURLs) {
    let loadTimes = [];
    let payLoads = [];
    let succesCounter = 0;
    let failCounter = 0;

    let localAllURLs = allURLs.allInternalURLs.concat(allURLs.allExternalURLs);
    
    for (let i = 0; i < localAllURLs.length; i++) {
        try {
            const response = await fetch(localAllURLs[i]);
            succesCounter++;
        } catch(error) {
            failCounter++;
        }
    }
    
    // localAllURLs.forEach(async(url) => {
    //     try {
    //         console.log(url);
    //         const response = await fetch(url);
    //         console.log("good")
    //         succesCounter++;
    //     } catch(error) {
    //         console.log("bad")
    //         failCounter++;
    //     }
    // })

    // Initialisation of return object
    let statsObject = {
        amountOfSuccesfullURLs: succesCounter,
        amountOfErrorURLs: failCounter,
        averageLoadTime: "",
        averagePayload: "",
    };

    return statsObject;
}