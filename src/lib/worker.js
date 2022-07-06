let http = require('http'),
    Express = require('express'),
    exec = require('madscience-node-exec'),
    bodyParser = require('body-parser'),
    process = require('process'),
    pidusage = require('pidusage'),
    httputils = require('madscience-httputils'),
    urljoin = require('url-join'),
    fs = require('fs-extra'),
    address = require('address'),
    cuid = require('cuid'),
    os = require('os'),
    winstonWrapper = require('winston-wrapper'),
    Settings = require('./settings'),
    
    app = Express(),
    _registered = false,
    timebelt = require('timebelt'),
    jobs = {};

(async()=>{

    let settings = await Settings({
        coordinator : null, // example : 127.0.0.1:8082,
        registerInterval : 5000,
        maxJobs : 1,
        verbose: false,
        // if keep alive is greater than zero, unchecked jobs older than this in minutes will be treated
        // as abandoned and automatically killed
        keepAlive: 0,
        logDir : './logs',
        logLevel : 'info',
        name : os.hostname,
        maxmia: 5, // passes of internal check clock before mia processes are treated as killed by OS and abandoned
        cleanupAbandoned : 10, // minutes after which finished jobs not cleaned up by clients are force deleted,
        tags: '',
        port : 8083
    }, [
        '/etc/cibroker/worker.yml',
        './worker.yml'
    ])

    await fs.ensureDir(settings.logDir)

    const _log = winstonWrapper.new(settings.logDir, settings.logLevel).log

    if (settings.coordinator && !settings.coordinator.startsWith('http://'))    
        settings.coordinator = `http://${settings.coordinator}`

    app.use(bodyParser.urlencoded({ extended: false }))
    app.use(bodyParser.json())
    app.set('json spaces', 4)

    function split(input){
        input = input.replace(/\r\n/g, '\n')
        input = input.replace(/\r/g, '\n')
        input = input.replace(/\\n/g, '\n')
        input = input.replace(/\\r/g, '\n')
        return input.split('\n')
    }

    /**
    * Test if sh present - this is mostly for windows systems. there is no guaranteed way to detect bash, so we run a 
    * standard command and if that fails, assume that the error must be caused by bash not being present
    */
    try {
        await exec.sh({ cmd : 'ls .'})
    } catch (ex){
        if (ex.code === 'ENOENT'){
            _log.warn('bash not found - please install and add to system PATH if applicable.')
            return process.exit(1)
        }
        else
            throw ex
    }

    async function killProcess(pid){

        if (typeof pid === 'string')
            pid = parseInt(pid)

        if (process.platform === 'win32')
            await exec.spawn({ cmd : 'Taskkill', args : [ '\/PID', pid, '\/f', '\/t']})
        else if (process.platform === 'linux')
            await exec.sh({ cmd: `kill -9 ${pid}` })
        else 
            throw 'http-shell does not support process kill on this OS.'
    }


    /**
     * Creates a job
     */    
    app.post('/v1/jobs', async (req, res)=>{
        try {
            
            // ensure that client passed in a command to run. All state for the job must therefore be passed in as switches 
            if (!req.body.command){
                res.status(400)
                return res.json({ error : '--command not set' })
            }

            // prevent running too many jobs at once
            let running = 0
            for (const jobId in jobs)
                if (jobs[jobId].isRunning)
                    running ++

            if (running >= settings.maxJobs){
                res.status(400)
                return res.json({ error : 'max jobs reached - try later, or another worker'})
            }
    
            const id = cuid()
            jobs[id] = {
                log : [],
                pid: null,
                mia: 0, // nr of ticks job is mia for 
                created: new Date,  // last time client checked in on job
                checked: new Date,  // time job was created
                exited: null,       // time job exited/failed/was abandoned
                passed : false,
                code : null,
                isKilled: false,
                isRunning : true
            }

            let command = decodeURIComponent(req.body.command);

            // wrap in anon so we can await it but let calling thread continue immediately
            (async ()=>{
                try {
                    // run the actual job here
                    await exec.sh({ cmd : command, 
                        onStdout : data => {
                            data = split(data)
    
                            if (jobs[id])
                                jobs[id].log = jobs[id].log.concat(data)
        
                            if (settings.verbose)
                                for(const item of data)
                                    _log.info(`${timebelt.toShort(new Date())}: ${item}`)
        
                        }, 
                        onStderr : data =>{
                            _log.error(`${timebelt.toShort(new Date())}: ERROR: ${data}`)
                        },
                        onStart : args => {
                            _log.info(`${timebelt.toShort(new Date())}: Job ${id} created, pid is ${args.pid}`)
                            _log.info(`${timebelt.toShort(new Date())}: Command : ${req.body.command}`)

                            jobs[id].pid = args.pid

                            res.json({
                                id,
                                pid : args.pid,
                                status : 'Job started',
                                date : new Date(),
                                jobCount : Object.keys(jobs).length 
                            })
                        },
                        onEnd : result => {
                            jobs[id].isRunning = false
                            jobs[id].exited = new Date()
                            jobs[id].code = result.code
                            jobs[id].passed = result.code === 0

                            _log.info(`${timebelt.toShort(new Date())}: Job ${id} exited normally with code ${result.code}`)
                        }
                    })

                } catch(ex){
                    if (jobs[id]){
                        jobs[id].isRunning = false
                        jobs[id].exited = new Date()
                        jobs[id].code = 1
                        jobs[id].log = jobs[id].log.concat(split(JSON.stringify(ex)))
                    }
                    _log.error(`${timebelt.toShort(new Date())}: Error - ${ex}`)
                }
            })()
    
        } catch(ex){
            _log.error(`${timebelt.toShort(new Date())}: ${ex}`)
            res.status(500)
            res.json({ error : ex.toString() })
        }
    })
    

    /**
     * Kills a job with the given pid
     */
    app.get('/v1/pkill/:jobid', async (req, res)=>{
        let job = jobs[req.params.jobid]
        
        if (!job){
            res.status(404)
            return res.json({error : `Job ${req.params.jobid} not found`})
        }

        _log.info(`${timebelt.toShort(new Date())}: Received pkill order for job id "${req.params.jobid}", process id "${job.pid}"`)
        res.end('pkill received, process will be terminated')

        try {
            await killProcess(pid)
        } catch(ex) {
            _log.error(`${timebelt.toShort(new Date())}: Failed to kill process for job ${req.params.jobid} : ${ex}`)
        }
    })
    

    /**
     * Gets status of an existing job.
     */    
    app.get('/v1/jobs/:id/:index', async(req, res)=>{
        try {
            let id = req.params.id,
                job = jobs[id],
                index = parseInt(req.params.index),
                pagesize = req.query.pagesize ? parseInt(req.query.pagesize) : 5
    
            if (!job){
                res.status(404)
                return res.json({error : `Job ${id} not found`})
            }
    
            job.checked = new Date()

            res.json({
                passed: job.passed,
                code : job.code,
                running : job.isRunning || index < job.log.length,// dont release until log has been fully piped
                log : index >= job.log.length? [] : job.log.slice(index, index + pagesize)
            })
    
        } catch(ex){
            _log.error(`${timebelt.toShort(new Date())}: ${ex}`)
            res.status(500)
            res.json({error : ex.toString()})
        }
    })
    
    
    /**
     * Deletes a completed job - it is up to the client to clean up the jobs it creates.
     */
    app.delete('/v1/jobs/:id', async (req, res)=>{
        try {
            let id = req.params.id,
                job = jobs[id]
    
            if (!job){
                res.status(404)
                return res.json({error : `Job ${id} not found`})
            }
    
            delete jobs[id]
            _log.info(`${timebelt.toShort(new Date())}: Job ${id} deleted by client`)
            res.json({message : 'Job deleted '})
        } catch(ex){
            _log.error(`${timebelt.toShort(new Date())}: ${ex}`)
            res.status(500)
            res.json({ error : ex.toString() })
        }
    })
    

    // internal maintenace loop
    setInterval(async()=>{
        
        // keeps this worker registered with coordinator. Coordinator feeds jobs to workers. If running in local mode,
        // a client can feed jobs to a worker directly
        if (settings.coordinator){
            let result
            try {
                result = await httputils.postUrlString(urljoin(settings.coordinator, `/v1/workers/${encodeURIComponent(settings.name)}?tags=${encodeURIComponent(settings.tags)}&registerInterval=${settings.registerInterval}`))
                result = JSON.parse(result.body)
                if (result.error)
                    throw result.error
    
                if (!_registered)
                    _log.info(`${timebelt.toShortTime(new Date())}: Registered with coordinator @ ${settings.coordinator}`)
    
                _registered = true
                // todo : harden this!
            } catch(ex){
                if (ex.code === 'ECONNREFUSED')
                    _log.warn(`${timebelt.toShortTime(new Date())}: Coordinator @ ${settings.coordinator} unreachable`)
                else {
                    _log.error(`${timebelt.toShort(new Date())}: Failed to register with coordinator`)
                    _log.error(`${timebelt.toShort(new Date())}: ${ex}`)
                }
            }
        }

        // clean out jobs for processes that got killed on the OS level without being caught by the normal run exception handler,
        // this shouldn't happen
        for (const jobId in jobs){
            
            const job = jobs[jobId]

            if (!job)
                continue

            // delete jobs that client failed to clean out
            if (job.exited !== null && timebelt.minutesDifference(new Date(), job.exited) > settings.cleanupAbandoned){
                delete jobs[jobId]
                _log.info(`${timebelt.toShort(new Date())}: Job ${jobId} deleted, job was not cleaned out by client.`)
                continue
            }

            if (job.isRunning){
                try {
                    await pidusage(job.pid)
               }catch(ex){
                   job.mia ++
   
                   if (job.mia > settings.maxmia){
                       job.isRunning = false
                       job.exited = new Date()
                       job.code = 1
                       job.passed = false
                       _log.error(`${timebelt.toShort(new Date())}: Failed to get pid ${job.pid} for job "${jobId}", treating as killed by OS and marking as failed. (internal ex :  ${ex})`)
                   }
               }
            }

        }

        // cleanup dead jobs that clients have abandoned
        if (settings.keepAlive > 0)
            for (const jobId in jobs){
                const job = jobs[jobId]

                if (!job)
                    continue

                if (!job.isRunning)
                    continue
                
                const minutesAlive = timebelt.minutesDifference(new Date(), job.checked)
                if (minutesAlive > settings.keepAlive){
                    try {
                        await killProcess(job.pid)
                        job.isRunning = false
                        job.exited = new Date()
                        _log.info(`${timebelt.toShort(new Date())}: Force killed "${jobId}" pid "${job.pid}, keep alive exceeded ${minutesAlive} minutes"`)
                    } catch (ex){
                        _log.error(`${timebelt.toShort(new Date())}: Failed to kill timed-out job "${jobId}" pid "${job.pid}", ${ex}`)
                    }
                }
            }

    }, settings.registerInterval)
    
    const server = http.createServer(app)
    server.listen(settings.port)
    console.log(`Worker : listening on port ${settings.port}`)
    if (!settings.coordinator)
        console.log(`Worker : coordinator not set, accepting direct client connections`)
    else{
        console.log(`Attached to coordinator @ ${settings.coordinator}`)
        console.log(`Worker : ip is ${address.ip()} - if coordinator has whitelisting enabled, add this to whitelist.`)
    }

})()

