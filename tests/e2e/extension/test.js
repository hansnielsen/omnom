const puppeteer = require('puppeteer');
const assert = require('assert');
console.log(process.argv);
if(process.argv.length != 3) {
    console.log("[E] Invalud number of arguments. Server address required");
    process.exit(1);
}

let serverAddr = process.argv[2];
let extId = '';
let extBaseUrl = '';
let testPageUrl = 'content/snapshots/83/8326b2287124efe25bec5a712509de986927692e7c1bbf85469c756c19b0a4be.gz';

function sleep(time) {
    return new Promise(function(resolve) {
        setTimeout(resolve, time)
    });
}

async function getExtensionID(browser) {
    let page = await browser.newPage();
    await page.goto('chrome://extensions', { waitUntil: 'load' });
    return await page.evaluate(async function() {
        return await new Promise(resolve => {
            resolve(document.querySelector('extensions-manager').shadowRoot.querySelector("#items-list").shadowRoot.querySelector("extensions-item").getAttribute("id"));
        });
    });
}

async function fillSettings(browser) {
    let page = await browser.newPage();
    await page.goto(extBaseUrl+'popup.html', {waitUntil: 'load'});
    await page.waitForSelector("#token");
    const tokenInput = await page.$("#token");
    await tokenInput.type("0000000000000000000000000000000000000000000000000000000000000000");
    const serverInput = await page.$("#url");
    await serverInput.type(serverAddr);
    page.evaluate((btnSelector) => {
        document.querySelector(btnSelector).click();
    }, 'input[type="submit"]');
    //await page.$eval('form', form => form.submit());
    page = await browser.newPage();
    await page.goto(extBaseUrl+'popup.html', {waitUntil: 'load'});
    const titleInput = await page.$("#title");
    assert(titleInput && titleInput != null && titleInput != undefined);
    await page.close();
}

async function openIndex(browser) {
    let page = await browser.newPage();
    await page.goto(serverAddr, {waitUntil: 'load'});
    const titleEl = await page.waitForSelector('title');
    const title = await titleEl.evaluate(el => el.textContent);
    assert(title == 'Omnom');
    await page.close();
}

async function login(browser) {
    let page = await browser.newPage();
    await page.goto(serverAddr+'login?token=0000000000000000000000000000000000000000000000000000000000000000', {waitUntil: 'load'});
    const userEl = await page.waitForSelector('a[href="/profile"]');
    const user = await userEl.evaluate(el => el.textContent);
    assert(user.endsWith('test'));
    await page.close();
}

async function testPageSnapshot(browser) {
    let page = await browser.newPage();
    await page.goto(serverAddr+'static/test/index.html', {waitUntil: 'load'});
    const workerTarget = await browser.waitForTarget(
        target => target.type() == "service_worker"
    );
    const worker = await workerTarget.worker();
    await worker.evaluate("chrome.action.openPopup();");
    const popup = await browser.waitForTarget(
        (target) =>
        target.type() === "page" &&
        target.url() === extBaseUrl+'popup.html'
    );
    const addonPopup = await popup.asPage();
    addonPopup.evaluate((btnSelector) => {
        document.querySelector(btnSelector).click();
    }, 'input[type="submit"]');
    const status = await addonPopup.waitForSelector("#status");
    const result = await status.evaluate(el => el.getAttribute('class'));
    //await page.waitForTimeout(50*1000);
    assert(result == 'success');
    addonPopup.close();
    const resp = await page.goto(serverAddr+testPageUrl, {waitUntil: 'load'});
    assert(resp.status() == 200);
}


const tests = [
    fillSettings,
    openIndex,
    login,
    testPageSnapshot
];

async function runTests(page) {
    for (let i in tests) {
        let testFn = tests[i];
        try {
            await testFn(page);
        } catch(e) {
            console.error("TEST '"+testFn.name+"' FAIL: \n", e.stack);
            process.exit(1);
        }
        console.log(String(((parseInt(i)+1) / tests.length * 100).toFixed()).padStart(3, ' ') + "% TEST PASSED: " + testFn.name);
    }
}

(async () => {
    // Path to extension folder
    const extPath = '../../../ext/build/';
    try {
        console.log('==>Open Browser');
        const browser = await puppeteer.launch({
            // Define the browser location
            // Disable headless mode
            headless: false,
            // Pass the options to install the extension
            args: [
                `--disable-extensions-except=${extPath}`,
                `--load-extension=${extPath}`,
                `--window-size=1024,1024`
            ],
        });
        //console.log("ID!!! ", await getExtensionID(browser));

        console.log('==>Navigate to Extension');
        extId = await getExtensionID(browser);
        console.log('==>Extension ID: ', extId);
        extBaseUrl = `chrome-extension://${extId}/`;
        // Take a screenshot of the extension page
        await runTests(browser);
        //console.log('==>Take Screenshot');
        //await page.screenshot({path: 'extension.png'});

        //console.log('==>Close Browser');
        await browser.close();
    }
    catch (err) {
        console.error(err);
    }
})();
