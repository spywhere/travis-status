const { ipcRenderer, shell } = require("electron");

let options = {};

function validate(){
    if (/^[\w\-]*$/g.test(document.getElementById("token").value)) {
        document.getElementById("token").style.border = "1px solid #fff";
    } else {
        document.getElementById("token").style.border = "1px solid #f66";
    }
}

function cancel() {
    ipcRenderer.send("preferences", undefined);
    window.close();
}

function response() {
    saveChanges(document.getElementById("travis-ci-pro").checked);
    ipcRenderer.send("preferences", options);
    window.close();
}

function saveChanges(travisPro){
    let token = document.getElementById("token").value;
    let intervalValue = document.getElementById("interval-value").value;
    let starredRepos = document.getElementById("show-starred-repos").checked;
    let repos = document.getElementById("show-repos").checked;

    if (!/^[\w\-]*$/g.test(token)) {
        token = "";
    }

    options = Object.assign(options, {
        [ travisPro ? "travis-ci-pro" : "travis-ci" ]: {
            token: token,
            show_repos: repos,
            show_starred_repos: starredRepos
        },
        refresh_interval: parseFloat(intervalValue)
    });
}

function updateInterval(minutes){
    if (minutes < 0) {
        document.getElementById("selected-interval").innerHTML = "Smart";
    } else if (minutes === 0) {
        document.getElementById("selected-interval").innerHTML = "Manual";
    } else if (minutes < 1) {
        document.getElementById("selected-interval").innerHTML = `Every ${
            Math.round(minutes * 60)
        } seconds`;
    } else if (minutes === 1) {
        document.getElementById("selected-interval").innerHTML = "Every minute";
    } else if (minutes < 60) {
        document.getElementById("selected-interval").innerHTML = `Every ${
            Math.round(minutes)
        } minutes`;
    } else if (minutes === 60) {
        document.getElementById("selected-interval").innerHTML = "Every hour";
    } else if (minutes > 60) {
        document.getElementById("selected-interval").innerHTML = `Every ${
            Math.round(minutes / 60).toFixed(1)
        } hours`;
    }

    document.getElementById("interval-value").value = minutes;
}

function update(save){
    save = save === undefined ? true : save;
    let travisPro = document.getElementById("travis-ci-pro").checked;
    if (save) {
        saveChanges(!travisPro);
    }

    let settings = (options || {})[
        travisPro ? "travis-ci-pro" : "travis-ci"
    ] || {};

    if (travisPro) {
        document.getElementById("product").innerHTML = "Travis CI Pro";
    } else {
        document.getElementById("product").innerHTML = "Travis CI";
    }

    document.getElementById("token").value = settings.token || "";

    let refreshInterval = (
        (options || {}).refresh_interval === undefined ?
        1 : options.refresh_interval
    );
    updateInterval(refreshInterval);

    document.getElementById("show-starred-repos").checked = (
        settings.show_starred_repos === undefined ?
        true : settings.show_starred_repos
    );
    document.getElementById("show-repos").checked = (
        settings.show_repos === undefined ?
        true : settings.show_repos
    );

    validate();
}

function help(){
    let travisPro = document.getElementById("travis-ci-pro").checked;
    shell.openExternal(
        travisPro ?
        "https://developer.travis-ci.com/authentication" :
        "https://developer.travis-ci.org/authentication"
    );
}

window.onload = () => {
    options = ipcRenderer.sendSync("preferences");
    update(false);
};
