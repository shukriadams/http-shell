var http = require('http'),
    Express = require('express'),
    exec = require('madscience-node-exec'),
    bodyParser = require('body-parser'),
    httputils = require('madscience-httputils');
    address = require('address'),
    fs = require('fs-extra'),
    urljoin = require('url-join'),
    cuid = require('cuid'),
    os = require('os'),
    Settings = require('./settings'),
    app = Express(),
    registered = false,
    timebelt = require('timebelt'),
    jobs = {};

(async function(){

    let settings = await Settings({
        coordinator : '127.0.0.1:8082',
        registerInterval : 5000,
        maxJobs : 1,
        name : os.hostname,
        tags: '',
        port : 8081
    }, [
        '/etc/cibroker/slave.yml',
        './slave.yml'
    ]);

    if (!settings.coordinator.startsWith('http://'))    
        settings.coordinator = `http://${settings.coordinator}`;


    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());
    app.set('json spaces', 4);
    

    /**
    * Test if sh present - this is mostly for windows systems. there is no guaranteed way to detect bash, so we run a 
    * standard command and if that fails, assume that the error must be caused by bash not being present
    */
    try {
        await exec.sh({ cmd : 'ls .'});
    } catch (ex){
        if (ex.code === 'ENOENT'){
            console.log('bash not found - please install and add to system PATH if applicable.');
            process.exit(1);
        }
        else
            throw ex;
    }
        

    /**
     * Creates a job
     */    
    app.post('/v1/jobs', async function(req, res){
        try {
            
            // ensure that client passed in a command to run. All state for the job must therefore be passed in as switches 
            if (!req.body.command){
                res.status(400);
                return res.json({ error : '--command not set' });
            }

            // prevent running too many jobs at once
            let running = 0;
            for (const name in jobs)
                if (jobs[name].isRunning)
                    running ++;

            if (running >= settings.maxJobs){
                res.status(400);
                return res.json({ error : 'max jobs reached - try later, or another slave'});
            }
    
            const id = cuid();
            jobs[id] = {
                log : [],
                created: new Date,
                passed : false,
                code : null,
                isRunning : true
            };
            
            let command = decodeURIComponent(req.body.command);

            // do not await this - let exec return immediately
            (async function(){
                try {
                    await exec.sh({ cmd : command, onStdout : function(data){
                        data = data.split('\n');
                        jobs[id].log = jobs[id].log.concat(data);
        
                        for(const item of data)
                            console.log(item);
        
                    }, onEnd : function(result){
                        jobs[id].isRunning = false;
                        jobs[id].code = result.code;
                        jobs[id].passed = result.passed;
                    }});

                } catch(ex){
                    jobs[id].isRunning = false;
                    jobs[id].code = 1;
                    jobs[id].log.push(JSON.stringify(ex));
                    console.log(ex);
                }
            })()
            
            console.log(`Job ${id} created`);
            console.log(`Running command : ${req.body.command}`);
            res.json({
                id,
                status : 'Job started',
                date : new Date(),
                jobCount : Object.keys(jobs).length 
            });
    
        } catch(ex){
            console.log(ex);
            res.status(500);
            res.json({ error : ex.toString() });
        }
    });
    
    
    /**
     * Gets status of an existing job.
     */    
    app.get('/v1/jobs/:id/:index', async function(req, res){
        try {
            let id = req.params.id,
                job = jobs[id],
                index = parseInt(req.params.index),
                pagesize = req.query.pagesize ? parseInt(req.query.pagesize) : 5;
    
            if (!job){
                res.status(404);
                return res.json({error : `Job ${id} not found`});
            }
    
            res.json({
                passed: job.passed,
                code : job.code,
                running : job.isRunning || index < job.log.length,// dont release until log has been fully piped
                log : index >= job.log.length? [] : job.log.slice(index, index + pagesize)
            });
    
        } catch(ex){
            console.log(ex);
            res.status(500);
            res.json({error : ex.toString()});
        }
    });
    
    
    /**
     * Deletes a job - it is up to the client to clean up the jobs it creates.
     */
    app.delete('/v1/jobs/:id', async function(req, res){
        try {
            let id = req.params.id,
                job = jobs[id];
    
            if (!job){
                res.status(404);
                return res.json({error : `Job ${id} not found`});
            }
    
            delete jobs[id];
            console.log(`Job ${id} deleted`);
            res.json({message : 'Job deleted '});
        } catch(ex){
            console.log(ex);
            res.status(500);
            res.json({ error : ex.toString() });
        }
    });
    

    // internal maintenace loop
    setInterval(async function(){
        // keep registered with coordinator
        let result;
        try {
            result = await httputils.postUrlString(urljoin(settings.coordinator, `/v1/slaves/${encodeURIComponent(settings.name)}?tags=${encodeURIComponent(settings.tags)}&registerInterval=${settings.registerInterval}`));
            result = JSON.parse(result.body);
            if (result.error)
                throw result.error;

            if (!registered)
                console.log(`Registered with coordinator @ ${settings.coordinator}`);

            registered = true;
            // harden this!
        }catch(ex){
            if (ex.code === 'ECONNREFUSED')
                console.log(`${timebelt.toShortTime(new Date())} - coordinator @ ${settings.coordinator} unreachable`);
            else {
                console.log('failed to register with coordinator');
                console.log(ex);
            }
        }

        // todo : cleanup dead jobs that clients have abandoned

    }, settings.registerInterval)
    
    var server = http.createServer(app);
    server.listen(settings.port);
    console.log(`Slave listening on port ${settings.port}`);
    console.log(`IP is ${address.ip()} - if Coordinator has whitelisting enabled, add this to whitelist.`);
})()

