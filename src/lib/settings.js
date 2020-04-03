/**
 * Loads settings in increasing override precedence. Defaults are used first, then yml files, and finally env vars.
 * Defaults : default settings.
 * overrideFiles : String array of paths to YML files that can be used to override settings. The first existing match wins
 * 
 */
const minimist = require('minimist'),
    fs = require('fs-extra'),
    yaml = require('js-yaml');

module.exports = async function(defaults = {}, overrideFiles = []){
    let settingsPath = null;

    for (const overrideFile of overrideFiles){
        if (await fs.exists(overrideFile)){
            settingsPath = overrideFile;
            break;
        }
    }

    // allow yml to override defaults
    if (settingsPath){
        let rawSettings = await fs.readFile(settingsPath, 'utf8');
        try {
            defaults = Object.assign(defaults, yaml.safeLoad(rawSettings));
        } catch(ex){
            throw  `unable to to parse YML ${ex}`;
        }
    }

    // allow argv to override default and yml
    let argv = minimist(process.argv.slice(2));
    for (let property in argv)
        defaults[property] = argv[property];

    return defaults;
}