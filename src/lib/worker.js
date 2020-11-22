let http = require('http'),
    Express = require('express'),
    exec = require('madscience-node-exec'),
    bodyParser = require('body-parser'),
    process = require('process'),
    minimist = require('minimist'),
    argv = minimist(process.argv.slice(2)),
    httputils = require('madscience-httputils');
    address = require('address'),
    fs = require('fs-extra'),
    urljoin = require('url-join'),
    cuid = require('cuid'),
    os = require('os'),
    Settings = require('./settings'),
    app = Express(),
    _registered = false,
    timebelt = require('timebelt'),
    jobs = {};

(async function(){

    let settings = await Settings({
        coordinator : null, // example : 127.0.0.1:8082,
        registerInterval : 5000,
        maxJobs : 1,
        name : os.hostname,
        tags: '',
        port : 8081
    }, [
        '/etc/cibroker/worker.yml',
        './worker.yml'
    ])

    if (settings.coordinator && !settings.coordinator.startsWith('http://'))    
        settings.coordinator = `http://${settings.coordinator}`

    app.use(bodyParser.urlencoded({ extended: false }))
    app.use(bodyParser.json())
    app.set('json spaces', 4)

    /**
    * Test if sh present - this is mostly for windows systems. there is no guaranteed way to detect bash, so we run a 
    * standard command and if that fails, assume that the error must be caused by bash not being present
    */
    try {
        await exec.sh({ cmd : 'ls .'})
    } catch (ex){
        if (ex.code === 'ENOENT'){
            console.log('bash not found - please install and add to system PATH if applicable.')
            process.exit(1)
        }
        else
            throw ex
    }
        

    /**
     * Creates a job
     */    
    app.post('/v1/jobs', async function(req, res){
        try {
            
            // ensure that client passed in a command to run. All state for the job must therefore be passed in as switches 
            if (!req.body.command){
                res.status(400)
                return res.json({ error : '--command not set' })
            }

            // prevent running too many jobs at once
            let running = 0
            for (const name in jobs)
                if (jobs[name].isRunning)
                    running ++

            if (running >= settings.maxJobs){
                res.status(400)
                return res.json({ error : 'max jobs reached - try later, or another worker'})
            }
    
            const id = cuid()
            jobs[id] = {
                log : [],
                created: new Date,
                passed : false,
                code : null,
                isRunning : true
            }
            
            let command = decodeURIComponent(req.body.command)

            // wrap in anon so we can await it but let calling thread continue immediately
            (async function(){
                try {
                    await exec.sh({ cmd : command, 
                        onStdout : function(data){
                            data = data.split('\n')
                            jobs[id].log = jobs[id].log.concat(data)
        
                            for(const item of data)
                                console.log(item)
        
                        }, 
                        onStart : function(args){
                            console.log(`Job ${id} created, pid is ${args.pid}`)
                            console.log(`Command : ${req.body.command}`)

                            res.json({
                                id,
                                pid : args.pid,
                                status : 'Job started',
                                date : new Date(),
                                jobCount : Object.keys(jobs).length 
                            })
                        },
                        onEnd : function(result){
                            jobs[id].isRunning = false
                            jobs[id].code = result.code
                            jobs[id].passed = result.passed
                        }
                    })

                } catch(ex){
                    jobs[id].isRunning = false
                    jobs[id].code = 1
                    jobs[id].log.push(JSON.stringify(ex))
                    console.log(ex)
                }
            })()
            

    
        } catch(ex){
            console.log(ex)
            res.status(500)
            res.json({ error : ex.toString() })
        }
    })
    

    /**
     * Kills a job with the given pid
     */
    app.get('/v1/pkill/:pid', async function(req, res){
        let pid = parseInt(req.params.pid)
        
        if (isNaN(pid))
            pid = req.params.pid.trim()

        console.log(`Received pkill order for "${pid}"`)
        res.end('pkill received')

        try {
            if (process.platform === 'win32')
                await exec.spawn({ cmd : 'Taskkill', args : [ '\/PID', pid, '\/f', '\/t']})
            else if (process.platform === 'linux')
                await exec.sh({ cmd: 'kill', args : ['-9', pid] })
            else 
                console.log('Process kill not supported on this OS.')

        } catch(ex){
            console.log(`failed to kill process ${req.params.pid} : ${ex} `)
        }
    })
    

    /**
     * Gets status of an existing job.
     */    
    app.get('/v1/jobs/:id/:index', async function(req, res){
        try {
            let id = req.params.id,
                job = jobs[id],
                index = parseInt(req.params.index),
                pagesize = req.query.pagesize ? parseInt(req.query.pagesize) : 5
    
            if (!job){
                res.status(404)
                return res.json({error : `Job ${id} not found`})
            }
    
            res.json({
                passed: job.passed,
                code : job.code,
                running : job.isRunning || index < job.log.length,// dont release until log has been fully piped
                log : index >= job.log.length? [] : job.log.slice(index, index + pagesize)
            })
    
        } catch(ex){
            console.log(ex)
            res.status(500)
            res.json({error : ex.toString()})
        }
    })
    
    
    /**
     * Deletes a completed job - it is up to the client to clean up the jobs it creates.
     */
    app.delete('/v1/jobs/:id', async function(req, res){
        try {
            let id = req.params.id,
                job = jobs[id]
    
            if (!job){
                res.status(404)
                return res.json({error : `Job ${id} not found`})
            }
    
            delete jobs[id]
            console.log(`Job ${id} deleted`)
            res.json({message : 'Job deleted '})
        } catch(ex){
            console.log(ex)
            res.status(500)
            res.json({ error : ex.toString() })
        }
    })
    

    // internal maintenace loop
    setInterval(async function(){
        
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
                    console.log(`Registered with coordinator @ ${settings.coordinator}`)
    
                _registered = true
                // harden this!
            } catch(ex){
                if (ex.code === 'ECONNREFUSED')
                    console.log(`${timebelt.toShortTime(new Date())} - coordinator @ ${settings.coordinator} unreachable`)
                else {
                    console.log('failed to register with coordinator')
                    console.log(ex)
                }
            }
        }
        // todo : cleanup dead jobs that clients have abandoned

    }, settings.registerInterval)
    
    const server = http.createServer(app)
    server.listen(settings.port)
    console.log(`Worker : listening on port ${settings.port}`)
    if (!settings.coordinator)
        console.log(`Worker : coordinator not set, accepting local connections only`)
    else
        console.log(`Worker : ip is ${address.ip()} - if coordinator has whitelisting enabled, add this to whitelist.`)

})()

