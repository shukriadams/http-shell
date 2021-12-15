const process = require('process'),
    urljoin = require('url-join'),
    httputils = require('madscience-httputils'),
    timebelt = require('timebelt'),
    Settings = require('./settings');

// load settings files
(async function(){
    try {
       
        const settings = await Settings({
            version : 1,
            logPath : './logs',
            operationLog : './jobs',
            timeout: 600000, // timeout of http calls. default is 10 minutes. Set to 0 to disable.
            onstart : null,
            port: 8083, // worker port
            workerPollInterval: 500, // ms
            coordinatorPollInterval: 1000,
            logPageSize: 100,
            protocol: 'http',
            worker : 'localhost',  // default is localhost
            coordinator : null, // example : 'localhost:8082',
            maxAttempts: 10,
            jobs : {}
        }, [
            '/etc/cibroker/client.yml',
            './client.yml'
        ])
       

        // tags can be passed in as comma-separated list, break to array
        settings.tags = settings.tags ? settings.tags.split(',') : []

        // enforce required settings
        if (!settings.coordinator && !settings.worker){
            console.log('Client : ERROR - no coordinator or worker url set. Set this in client.yml or with --coordinator or --worker')
            return process.exit(1)
        }

        if (!settings.command || !settings.command.length){
            console.log('Client mode requires command [shell command]. Set this in client.yml or with --command')
            return process.exit(1)
        }

        let attempts = 0,
            workers,
            workerHost,
            pid,
            jobId = null

        function handleExit(){
            if (pid){
                console.log(`${settings.protocol}://${workerHost}:${settings.port}/v1/pkill/${pid}`)
                console.log(`Send remote pkill for "${pid}"`)
                
                let exec = require('child_process')
                exec.execSync(`curl ${settings.protocol}://${workerHost}:${settings.port}/v1/pkill/${pid}`, function (error, stderr) {
                    // we don't care about errors
                })
            }

            process.exit(1)
        }

        //do something when app is closing
        process.on('SIGINT', handleExit)



        // loop to try to get a worker from coordinator, and then start job on worker
        while(true){
            attempts ++

            // sleep this thread a bit so we don't hose CPU
            await timebelt.pause (settings.coordinatorPollInterval)

            // tried too many times without success, fail
            if (settings.maxAttempts && attempts >= settings.maxAttempts){
                console.log(`failed to resolve task after ${attempts} attempts, exiting`)
                process.exit(1)
            }

            // if coordinator and worker both set, let coordinator win
            if (settings.coordinator){
                // try to get worker list
                try {
                    workers = await httputils.downloadString(urljoin(settings.coordinator, '/v1/workers'))
                    workers = JSON.parse(workers.body)
                }catch(ex){
                    if (ex.code === 'ECONNREFUSED')
                        console.log(`coordinator unreachable @ ${settings.coordinator}`)
                    else{
                        console.log(`Error getting worker list from coordinator`, ex)
                    }
                    continue
                }

                // did coordinator return any workers
                let workerNames = Object.keys(workers)
                if (!workerNames.length){
                    console.log('No workers registered on coordinator.')
                    continue
                }

                // find a worker ...
                // start : all workers are eligible
                eligibleWorkerNames = workerNames.slice(0)

                // if client has tag requirements, find all workers that satisfy all tags
                if (settings.tags.length){
                    eligibleWorkerNames = []
                    for (const workerName in workers){
                        let workerIsEligible = true
                        for (const tag of settings.tags){
                            if (!workers[workerName].tags.includes(tag)){
                                workerIsEligible = false
                                break
                            }
                        }

                        if (workerIsEligible)
                            eligibleWorkerNames.push(workerName)
                    }
                }

                // select a random worker of all eligible. Unlike Jenkins, we do not always route back to the same worker.
                workerHost = eligibleWorkerNames[Math.floor(Math.random() * (eligibleWorkerNames.length + 1))]

                // no worker found, try again in next loop run
                if (!workerHost){
                    console.log('Looking for a worker machine to run command on ...')
                    continue
                }

            } else {
                // single worker is forced, use that
                workerHost = settings.worker
            }

            console.log(`Attempting to send command to --worker @ host ${workerHost}`)
            let response = await httputils.postUrlString(`${settings.protocol}://${workerHost}:${settings.port}/v1/jobs`, `command=${encodeURIComponent(settings.command)}`)
            try {
                let jobDetails =JSON.parse(response.body)
                if (jobDetails.error)
                    throw jobDetails.error

                jobId = jobDetails.id
                pid = jobDetails.pid

                break
            } catch(ex){
                console.log('unexpected response creating job')
                console.log(response.body)
                return process.exit(1)
            }
        }


        // handle -
        // cannot contact coordinator
        // coordinate has no workers
        // worker not contactable
        // max jobs reached
        // coordinate not found
        // no workers match requests
        // no workers currently available
        // worker accepted job but failed anyway
        // worker X keeps failing job

        // loop to get job status from worker
        let index = 0,
            interval = setInterval(async () => {
                let status = null
                
                try {
                    status = await httputils.downloadString(`${settings.protocol}://${workerHost}:${settings.port}/v1/jobs/${jobId}/${index}?pagesize=${settings.logPageSize}`)
                    status = JSON.parse(status.body)
                    index += status.log ? status.log.length : 0

                    if(status.running){
                        if (status.log.length)
                            console.log(status.log.join('\n'))
                    } else {
                        await httputils.delete(`${settings.protocol}://${workerHost}:${settings.port}/v1/jobs/${jobId}`)
                        clearInterval(interval)
                        
                        if (!status.passed){
                            console.log(`Job failed with code ${status.code}`)
                            return process.exit(1)
                        }
                    }
                } catch(ex){
                    console.log(`error contacting agent`)
                    console.log(status)
                    console.log(ex)
                    process.exit(1)
                }
            }, settings.workerPollInterval)

    } catch (ex) {
        console.log(ex)
        process.exit(1)
    }
})()
 
