var http = require('http'),
    Express = require('express'),
    exec = require('madscience-node-exec'),
    bodyParser = require('body-parser'),
    httputils = require('madscience-httputils');
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
        coordinatorUrl : 'http://127.0.0.1:8082',
        registerInterval : 5000,
        maxJobs : 1,
        name : os.hostname,
        tags: '',
        port : 8081
    }, [
        '/etc/cibroker/slave.yml',
        './slave.yml'
    ]);

    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());
    app.set('json spaces', 4);
    
    
    /**
     * Creates a job
     */    
    app.post('/v1/jobs', async function(req, res){
        try {
            
            // ensure that client passed in a command to run. All state for the job must therefore be passed in as switches 
            if (!req.body.command){
                res.status(400);
                return res.end('--command not set');
            }

            // prevent running too many jobs at once
            let running = 0;
            for (const name in jobs)
                if (jobs[name].isRunning)
                    running ++;

            if (running >= settings.maxJobs){
                res.status(400);
                return res.end('max jobs reached - try later, or another slave');
            }
    
            const id = cuid();
            jobs[id] = {
                log : [],
                created: new Date,
                passed : false,
                code : null,
                isRunning : true
            };
    
            // do not await this - let exec return immediately
            await exec.sh({ cmd : req.body.command, onStdout : function(data){
                data = data.split('\n');
                jobs[id].log = jobs[id].log.concat(data);
            }, onEnd : function(result){
                jobs[id].isRunning = false;
                jobs[id].code = result.code;
                jobs[id].passed = result.passed;
            }});
            
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
            res.end(ex.toString());
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
                return res.end(`Job ${id} not found`);
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
            res.end(ex.toString());
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
                return res.end(`Job ${id} not found`);
            }
    
            delete jobs[id];
            console.log(`Job ${id} deleted`);
            res.end();
        } catch(ex){
            console.log(ex);
            res.status(500);
            res.end(ex.toString());
        }
    });
    
    // internal maintenace loop
    setInterval(async function(){
        // keep registered with coordinator
        try {
            let result = await httputils.postUrlString(urljoin(settings.coordinatorUrl, `/v1/slaves/${encodeURIComponent(settings.name)}?tags=${encodeURIComponent(settings.tags)}&registerInterval=${settings.registerInterval}`));
            if (!registered)
                console.log(`Registered with coordinator @ ${settings.coordinatorUrl}`);

            registered = true;
            // harden this!
        }catch(ex){
            if (ex.code === 'ECONNREFUSED')
                console.log(`${timebelt.toShort(new Date())} - Coordinator unreachable`);
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
    
})()

