const process = require('process'),
    urljoin = require('url-join'),
    httputils = require('madscience-httputils');
    timebelt = require('timebelt'),
    Settings = require('./settings'),
    fs = require('fs-extra');

// load settings files
(async function(){
    try {
       
        let settings = await Settings({
            version : 1,
            logPath : './logs',
            operationLog : './jobs',
            timeout: 600000, // timeout of http calls. default is 10 minutes. Set to 0 to disable.
            onstart : null,
            port: 8081, // slave port
            slavePollInterval: 500, // ms
            logPageSize: 100,
            protocol: 'http',
            coordinator : null,
            jobs : {}
        }, [
            '/etc/cibroker/client.yml',
            './client.yml'
        ]);

        settings.tags = settings.tags ? settings.tags.split(',') : [];

        // enforce required settings
        if (!settings.coordinator)
            throw 'Client mode requires coordinator [URL]';

        if (!settings.command || !settings.command.length)
            throw 'Client mode requires command [shell command].';

        let attempts = 0,
            slaves,
            slaveHost,
            jobId = null,
            maxAttempts = 60,
            coordinatorInterval = 1000;

        // loop to try to get a slave from coordinator, and then start job on slave
        while(true){
            attempts ++;
            await timebelt.pause (coordinatorInterval);
            if (attempts >= maxAttempts){
                console.log(`failed to resolve task after ${attempts} attemptes, exiting`);
                process.exit(1);
            }

            // try to get slave list
            try {
                slaves = await httputils.downloadString(urljoin(settings.coordinator, '/v1/slaves'));
                slaves = JSON.parse(slaves.body);
            }catch(ex){
                if (ex.code === 'ECONNREFUSED')
                    console.log(`coordinator unreachable @ ${settings.coordinator}`);
                else{
                    console.log(`Error getting slave list from coordinator`, ex);
                }
                continue;
            }

            // did coordinator return any slaves
            let slaveNames = Object.keys(slaves);
            if (!slaveNames.length){
                console.log('No slaves registered on coordinator.');
                continue
            }

            // start with a random slave
            eligibleSlaveNames = slaveNames.slice(0); // duplicate all names
            if (settings.tags.length){
                let eligibleSlaveNames = [];
                for (const name in slaves){
                    if (slaves[name].tags.filter(value => settings.tags.includes(value)))
                        eligibleSlaveNames.push(name);
                }
            }

            slaveHost = eligibleSlaveNames[Math.floor(Math.random() * (eligibleSlaveNames.length + 1))];  
            if (!slaveHost){
                console.log('No suitable slave currently available, waiting...');
                continue
            }


            let response = await httputils.postUrlString(`${settings.protocol}://${slaveHost}:${settings.port}/v1/jobs`, `command=${argv.command}`);
            
            try {
                jobId = JSON.parse(response.body).id;

                break;
            } catch(ex){
                console.log('unexpectd response creating job');
                console.log(response.body);
                return process.exit(1)
            }
        }


        // handle -
        // cannot contact coordinator
        // coordinate has no slaves
        // slave not contactable
        // max jobs reached
        // coordinate not found
        // no slaves match requests
        // no slaves currently available
        // slave accepted job but failed anyway
        // slave X keeps failing job

        // loop to get job status from slave
        let index = 0;
        let interval = setInterval(async () => {
            let status = null;
            try {
                let status = await httputils.downloadString(`${settings.protocol}://${slaveHost}:${settings.port}/v1/jobs/${jobId}/${index}?pagesize=${settings.logPageSize}`);
                status = JSON.parse(status.body);
                index += status.log.length;

                if(status.running){
                    console.log(status.log.join('\n'));
                } else {
                    await httputils.delete(`${settings.protocol}://${slaveHost}:${settings.port}/v1/jobs/${jobId}`);
                    clearInterval(interval);

                    if (status.failed){
                        console.log(`Job failed`);
                        return process.exit(1);
                    }

                    return console.log(`Job done, exiting.`);
                }
            } catch(ex){
                console.log(`error contacting agent`);
                console.log(status);
                console.log(ex);
                process.exit(1);
            }
        }, settings.slavePollInterval);

    } catch (ex) {
        console.log(ex);
        process.exit(1);
    }
})()
 
