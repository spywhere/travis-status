const path = require("path");
const url = require("url");
const { BrowserWindow, ipcMain } = require("electron");
const config = require("../config");

module.exports = (preferences) => {
    return new Promise((resolve, reject) => {
        let returnValue = preferences;

        let window = new BrowserWindow({
            width: 350,
            height: 400,
            backgroundColor: "#222",
            resizable: false,
            show: false,
            alwaysOnTop: true,
            frame: false,
            autoHideMenuBar: true
        });

        window.on("closed", () => {
            if (returnValue === undefined) {
                reject();
            } else {
                resolve(returnValue);
            }
        });

        window.once("ready-to-show", () => {
            window.show();
        });

        window.loadURL(url.format({
            protocol: "file",
            slashes: true,
            pathname: config.view("preferences")
        }));

        ipcMain.on("preferences", (event, data) => {
            if (data) {
                returnValue = data;
            }
            event.returnValue = returnValue;
        });

        ipcMain.on("log", (event, data) => {
            console.log(data);
        });
    });
};
