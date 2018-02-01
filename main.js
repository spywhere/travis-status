const { app, Tray, Menu, shell } = require("electron");
const path = require("path");
const moment = require("moment");
const rq = require("request");
const config = require("./config");
const api = require("./api");

const preferences = require("./ipc-process/preferences");

// Auth
// - https://developer.github.com/v3/oauth_authorizations/#create-a-new-authorization
// - https://developer.github.com/v3/auth/#working-with-two-factor-authentication

let settings = config.load();
let showingPreferences = false;
let lastState = undefined;
let multiplier = 1;
let currentDuration = 10000;
let currentTimer;
let broadcasts = [];
let status = undefined;

let tray;

let defaultMenu = [{
    label: "Preferences...",
    type: "normal",
    click: showPreferences
}, {
    label: "Quit",
    type: "normal",
    click: () => {
        clearTimeout(currentTimer);
        app.quit();
    }
}];

app.on("window-all-closed", () => {});

app.once("ready", () => {
    if (app.dock) {
        app.dock.hide();
    }

    tray = new Tray(config.image("icon-idle"));

    buildMenu();
    startup();
});

function startup(){
    if (
        (settings["travis-ci"] && settings["travis-ci"]["token"]) ||
        (settings["travis-ci-pro"] && settings["travis-ci-pro"]["token"])
    ) {
        updateStatus();
        updateBroadcasts();
    } else {
        showPreferences();
    }
}

function buildMenu(){
    let contextMenu = Menu.buildFromTemplate(defaultMenu);

    tray.setContextMenu(contextMenu);
}

function tryToUpdate(firstTime){
    if (
        (settings["travis-ci"] && settings["travis-ci"]["token"]) ||
        (settings["travis-ci-pro"] && settings["travis-ci-pro"]["token"])
    ) {
        updateStatus();
        updateBroadcasts();
    } else if (firstTime) {
        showPreferences();
    }
}

function showPreferences(){
    if (showingPreferences) {
        return;
    }
    showingPreferences = true;
    preferences(settings).then((newSettings) => {
        settings = newSettings;
        config.save(newSettings);
        showingPreferences = false;
        tryToUpdate();
    }).catch(() => {
        showingPreferences = false;
    });
}

function repoMenuMapper(repo){
    let states = repo.builds.map((build) => {
        if (
            build.state === "passed" ||
            build.state === "failed" ||
            build.state === "started"
        ) {
            return build.state.substr(0, 1);
        }
        if (build.state === "errored") {
            return "f";
        }
        if (build.state === "created") {
            return "s";
        }
        return "d";
    }).join("");

    return {
        type: "normal",
        label: `${ repo.slug }${
            repo.build_number ? ` #${ repo.build_number }` : ""
        }`,
        icon: config.image(`build-icons/build-icon-${
            (states + "ddd").substr(0, 3)
        }`),
        click: () => {
            shell.openExternal(repo.href);
        }
    };
}

function getPreferences(){
    return {
        "travis-ci": {
            endpoint: "travis-ci.org",
            token: (
                settings["travis-ci"] ?
                settings["travis-ci"]["token"] :
                undefined
            ),
            onlyStarred: (
                settings["travis-ci"] &&
                settings["travis-ci"]["show_starred_repos"] &&
                !settings["travis-ci"]["show_repos"]
            )
        },
        "travis-ci-pro": {
            endpoint: "travis-ci.com",
            token: (
                settings["travis-ci-pro"] ?
                settings["travis-ci-pro"]["token"] :
                undefined
            ),
            onlyStarred: (
                settings["travis-ci-pro"] &&
                settings["travis-ci-pro"]["show_starred_repos"] &&
                !settings["travis-ci-pro"]["show_repos"]
            )
        }
    };
}

function updateStatus(){
    let preferences = getPreferences();

    Promise.all([
        (
            preferences["travis-ci"].token ?
            getTravisCIStatus(
                preferences["travis-ci"].endpoint,
                preferences["travis-ci"].token,
                preferences["travis-ci"].onlyStarred
            ) : Promise.resolve({
                isRunning: false,
                hasFailedBuild: false,
                starred: [],
                repositories: []
            })
        ), (
            preferences["travis-ci-pro"].token ?
            getTravisCIStatus(
                preferences["travis-ci-pro"].endpoint,
                preferences["travis-ci-pro"].token,
                preferences["travis-ci-pro"].onlyStarred
            ) : Promise.resolve({
                isRunning: false,
                hasFailedBuild: false,
                starred: [],
                repositories: []
            })
        )
    ]).then(([travisCIResult, travisCIProResult]) => {
        let menuTemplate = [];
        let debugMenu = [];

        if (travisCIResult.starred.length > 0) {
            menuTemplate.push({
                type: "normal",
                label: "Travis CI [Starred]",
                enabled: false
            });

            menuTemplate = menuTemplate.concat(
                travisCIResult.starred.map(repoMenuMapper)
            );
        }

        if (travisCIProResult.starred.length > 0) {
            menuTemplate.push({
                type: "normal",
                label: "Travis CI Pro [Starred]",
                enabled: false
            });

            menuTemplate = menuTemplate.concat(
                travisCIProResult.starred.map(repoMenuMapper)
            );
        }

        if (menuTemplate.length > 0) {
            menuTemplate.push({
                type: "separator"
            });
        }

        if (travisCIResult.repositories.length > 0) {
            menuTemplate.push({
                type: "normal",
                label: "Travis CI",
                enabled: false
            });

            menuTemplate = menuTemplate.concat(
                travisCIResult.repositories.map(repoMenuMapper)
            );
        }

        if (travisCIProResult.repositories.length > 0) {
            menuTemplate.push({
                type: "normal",
                label: "Travis CI Pro",
                enabled: false
            });

            menuTemplate = menuTemplate.concat(
                travisCIProResult.repositories.map(repoMenuMapper)
            );
        }

        let currentState = "idle";
        if (
            travisCIResult.isRunning || travisCIProResult.isRunning
        ) {
            currentState = "running";
            tray.setImage(config.image("icon-running"));
        } else if (
            travisCIResult.hasFailedBuild || travisCIProResult.hasFailedBuild
        ) {
            currentState = "failed";
            tray.setImage(config.image("icon-failed"));
        } else {
            currentState = "passed";
            tray.setImage(config.image("icon-passed"));
        }

        if (currentState === lastState && currentState !== "running") {
            if (multiplier < 128) {
                multiplier *= 1.4;
            }
        } else {
            multiplier = 1;
        }
        lastState = currentState;

        let mode = "Manual";
        let refreshInterval = undefined;

        if (
            settings["refresh_interval"] === undefined ||
            settings["refresh_interval"] > 0
        ) {
            mode = "Fixed";
            refreshInterval = (settings["refresh_interval"] || 1) * 60000;
        } else if (settings["refresh_interval"] < 0) {
            mode = "Smart";
            refreshInterval = currentDuration * multiplier;
        }

        if (currentTimer) {
            clearTimeout(currentTimer);
        }

        if (refreshInterval !== undefined) {
            setTimeout(tryToUpdate, refreshInterval);
        }

        if (settings["debug"]) {
            debugMenu.push({
                type: "normal",
                label: `${ mode } interval: ${
                    ((refreshInterval || 0) / 1000).toFixed(2)
                }s (x${ multiplier.toFixed(2) })`,
                enabled: false
            });
        }

        tray.setContextMenu(Menu.buildFromTemplate([{
            type: "normal",
            label: `Last updated: ${ moment().format("HH:mm:ss") }`,
            enabled: false
        }].concat(debugMenu).concat([{
            type: "separator"
        }]).concat(menuTemplate).concat([{
            type: "separator"
        }, {
            type: "normal",
            label: "Update now",
            click: tryToUpdate
        }].concat(defaultMenu))));
    }).catch((error) => {
        console.error(error);
        tray.setContextMenu(Menu.buildFromTemplate([{
            type: "normal",
            label: `Last updated: ${ moment().format("HH:mm:ss") }`,
            enabled: false
        }, {
            type: "normal",
            label: `Failed to update, is API token still valid?`,
            enabled: false
        }, {
            type: "separator"
        }, {
            type: "normal",
            label: "Update now",
            click: tryToUpdate
        }].concat(defaultMenu)));
    });
}

function updateBroadcasts(){
    // return new Promise((resolve, reject) => {
    //     console.log("getting broadcasts...");
    //     callTravisCI(api(endpoint).broadcasts({
    //         active: false
    //     }), token).then((response) => {
    //         console.log(response.body);
    //     }).catch(reject);
    // });
}

function callTravisCI(url, token){
    return new Promise((resolve, reject) => {
        rq(url.href, {
            headers: {
                "Authorization": `token ${ token }`,
                "Travis-API-Version": "3"
            },
            json: true
        }, (error, response) => {
            if (error) {
                console.error(error);
                return reject(error);
            }
            if (response.statusCode !== 200) {
                console.log(response.statusCode, response.body);
                return reject(new Error("access denied"));
            }
            return resolve(response);
        });
    });
}

function getTravisCIBroadcast(endpoint, token){
    // category
    // - announcement
    // - warning (red)

    return new Promise((resolve, reject) => {
        callTravisCI(api(endpoint).broadcasts).then((response) => {

        }).catch(reject);
    });
}

function getTravisCIStatus(endpoint, token, onlyStarred){
    return new Promise((resolve, reject) => {
        let option = {
            active: true,
            sort_by: "current_build:desc",
            include: "repository.current_build"
        };

        if (onlyStarred) {
            option["starred"] = true;
        }

        callTravisCI(api(endpoint).repos(option), token).then((response) => {
            if (response.statusCode !== 200) {
                return reject(new Error("access denied"));
            }

            let body = response.body;

            let starredRepos = [];
            let repos = [];
            let running = false;
            let failed = false;

            let reposBuilds = [];

            for (let repo of body.repositories) {
                let current_build = repo.current_build;
                let current_build_state = (
                    current_build ? current_build.state : "idle"
                );
                let previous_build_state = (
                    current_build ? current_build.previous_state : "idle"
                );
                let build_number = (
                    current_build ? current_build.number : undefined
                );
                let href = `https://${
                    endpoint
                }/${
                    repo.slug
                }${
                    (current_build) ? `/builds/${ current_build.id }` : ""
                }`;

                if (
                    current_build_state === "created" ||
                    current_build_state === "started"
                ) {
                    running = true;
                } else if (
                    current_build_state === "failed" ||
                    current_build_state === "errored"
                ) {
                    failed = true;
                }

                let repoInfo = {
                    href: repo["@href"],
                    starred: repo["starred"],
                    slug: repo.slug,
                    branch: (
                        current_build ? current_build.branch.name : undefined
                    ),
                    build_number: build_number,
                    href: href
                };

                if (!onlyStarred || repo.starred) {
                    reposBuilds.push(Promise.all([
                        Promise.resolve(repoInfo),
                        callTravisCI(api(endpoint, repo).repositoryBuilds({
                            limit: 3
                        }), token)
                    ]));
                }
            }

            if (reposBuilds.length > 0) {
                Promise.all(reposBuilds).then((repoInfo) => {
                    for (let repoBuilds of repoInfo) {
                        let [repo, response] = repoBuilds;
                        let body = response.body;
                        let builds = body.builds;

                        let repoInfo = repo;
                        repoInfo["builds"] = builds.map((build) => ({
                            number: build.number,
                            state: build.state
                        }));

                        if (repo.starred) {
                            starredRepos.push(repoInfo);
                        }
                        if (!onlyStarred) {
                            repos.push(repoInfo);
                        }
                    }
                    return resolve({
                        isRunning: running,
                        hasFailedBuild: failed,
                        starred: starredRepos,
                        repositories: repos
                    });
                });
            } else {
                return resolve({
                    isRunning: running,
                    hasFailedBuild: failed,
                    starred: starredRepos,
                    repositories: repos
                });
            }
        }).catch(reject);
    });
}
