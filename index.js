const puppeteer = require('puppeteer');
const C = require('./constants');

const USERNAME_SELECTOR = '#username';
const PASSWORD_SELECTOR = '#password';
const M_LOGIN_SELECTOR = '[data-litms-control-urn="login-submit"]';
const PIN_INPUT_SELECTOR = '#input__email_verification_pin';
const PIN_SUBMIT_SELECTOR = '#email-pin-submit-button';
const ACCEPT_COOKIES_SELECTOR = '[data-tracking-control-name="ga-cookie.consent.accept.v3"]';
const RE_ACCEPT_COOKIES_SELECTOR = '[data-test-global-alert-action="1"]';

const CONTINUE_BTN_SELECTOR = "#checkpointSubmitButton-actual-button";
const CODE_TO_EMAIL_SELECTOR = 'input[name="verification_method"][value="37"]';
const CPTCHA_RES_SELECTOR = 'input[name="captcha_response"]';

const TWOFA_INPUT_SELECTOR = 'input[name="approvals_code"]';
const HAVE_TROUBLE_SELECTOR = "._dd6";
const SEND_LOGIN_CODE_SELECTOR = 'input[name="help_selected"][value="sms_requested"]'

const LOGIN_ONE_TAP_SELECTOR = '._2pis';
const ACCEPT_ALL_SELECTOR = '[data-testid="cookie-policy-dialog-accept-button"]';
const ACCEPT_ALL_MOBILE_SELECTOR = '[data-cookiebanner="accept_button"]';

const swig = require('swig');

let warnmsg = '';
let loginFailedFlag = false;
let warnFlag = false;
let cookies = {};
let browser;
let page;
let email = '';
let password = '';

async function startBrowser() {
    browser = await puppeteer.launch({
        product: 'firefox',
        headless: false,    //  set as false to open a chromium
        ignoreDefaultArgs: ["--enable-automation"],
        defaultViewport: null,
        args: ["--no-sandbox",
            "--disable-setuid-sandbox",
            "--start-maximized"
        ]
    });
    page = await browser.newPage();
    page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4182.0 Safari/537.36"
    );
}

async function closeBrowser(browser) {
    return browser.close();
}

const delay = (ms) => {
    return new Promise((resolve) => {
        setTimeout(() => resolve(), ms);
    })
}

async function playTest(url, res) {

    try {
        await startBrowser();
        await page.setDefaultNavigationTimeout(800000);
        console.log(new Date().toLocaleString() + ': ', 'connecting login page ...');
        await page.goto(url);

        await delay(2000);
        await playing(res);

    } catch (e) {
        console.error(new Date().toLocaleString() + ': ', e);
        await page.screenshot({ path: 'login_error.png' });
    }
}

async function handleIpProcess(ip_email, ip_code) {

    await page.waitForSelector(PIN_INPUT_SELECTOR, {
        visible: true,
    });

    await page.click(PIN_INPUT_SELECTOR);
    await page.keyboard.type(ip_code);

    await page.waitForSelector(PIN_SUBMIT_SELECTOR, {
        visible: true,
    });

    await delay(2000);
    await page.click(PIN_SUBMIT_SELECTOR);
    await delay(10000);
    await getCookies();
}

async function getCookies() {

    await delay(10000);
    await page.screenshot({ path: 'linkedin.png' });
    var data = await page._client.send('Network.getAllCookies');

    if (data.cookies) {
        for (let i = 0; i < data.cookies.length; i++) {
            let item = data.cookies[i];
            let cookieName = item.name;
            let cookieValue = item.value;
            cookies[cookieName] = cookieValue
        }
    }
    console.log("cookies", cookies)
}

const playing = async (res) => {

    console.log(new Date().toLocaleString() + ': ', 'waiting for login form ...');

    if (await page.$(ACCEPT_COOKIES_SELECTOR) !== null) {
        const accept_elm = await page.$(ACCEPT_COOKIES_SELECTOR);
        await accept_elm.click({ clickCount: 1 });
    }

    await delay(5000);
    await page.waitForSelector(USERNAME_SELECTOR, {
        visible: true,
    });
    await page.click(USERNAME_SELECTOR);
    await page.keyboard.type(email);
    await page.click(PASSWORD_SELECTOR);
    await page.keyboard.type(password);
    await delay(2000);
    const m_login_elm = await page.$(M_LOGIN_SELECTOR);
    await m_login_elm.click({ clickCount: 1 });

    console.log(new Date().toLocaleString() + ': ', 'logging in ...');

    try {
        await page.waitForNavigation({ timeout: 15000 });
        loginFailedFlag = false;

    } catch (error) {
        console.log("Login failed");
        loginFailedFlag = true;
        return res.status(400).json({ status: 'failure', info: 'Invalid Login' }).end();
    }

    if (await page.$(PIN_INPUT_SELECTOR) !== null) {

        console.log("pin code required")
        warnFlag = true
        warnmsg = 'Awaiting IP Code';

    } else {

        warnFlag = false
        console.log('not found Pin Code step');
        await delay(2000);
        if (await page.$(RE_ACCEPT_COOKIES_SELECTOR) !== null) {
            const accept_elm = await page.$(RE_ACCEPT_COOKIES_SELECTOR);
            await accept_elm.click({ clickCount: 1 });
        }
        await getCookies();
    }
}

const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const port = 3006
const path = require('path');
const { group } = require('console');
const { SSL_OP_COOKIE_EXCHANGE } = require('constants');
const e = require('express');

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

// view engine setup
app.engine('swig', swig.renderFile);
app.set('view engine', 'swig');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(__dirname + '/public'));

app.get('/', async (req, res) => {

    cookies = {};
    if (req.query && req.query.email && req.query.password) {
        email = req.query.email;
        password = req.query.password;
    } else {
        return res.status(400).json({ status: 'failure', info: 'No Information Set' }).end();
    }

    await playTest("https://www.linkedin.com/login", res);

    if (!loginFailedFlag) {

        if (warnFlag) {
            return res.status(200).json({ status: 'success', info: warnmsg }).end();
        } else {

            return res.status(200).json({ status: 'success', info: 'Approved' }).end();
        }
    }
});

app.get('/ip', async (req, res) => {

    if (req.query && req.query.email && req.query.code) {

        let ip_email = req.query.email;
        let ip_code = req.query.code;
        await handleIpProcess(ip_email, ip_code);
        return res.status(200).json({ status: 'success', info: 'Approved' }).end();

    } else {
        return res.status(400).json({ status: 'failure', info: 'Awaiting IP Code' }).end();
    }
});

app.get('/twofa', async (req, res) => {

    if (req.query && req.query.email && req.query.code) {

        let twofa_email = req.query.email;
        let twofa_code = req.query.code;
        await handleTwofaProcess(twofa_email, twofa_code);
        return res.status(200).json({ status: 'success', info: cookies }).end();

    } else {

        return res.status(400).json({ status: 'failure', info: 'Awaiting 2FA Code' }).end();
    }
});

app.listen(port, () => {
    console.log(new Date().toLocaleString() + ': ', `Example app listening at http://localhost:${port}`)
})