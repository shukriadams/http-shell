var http = require('http'),
    Express = require('express'),
    exec = require('madscience-node-exec'),
    bodyParser = require('body-parser'),
    httputils = require('madscience-httputils');
    minimist = require('minimist'),
    yaml = require('js-yaml'),
    fs = require('fs-extra'),
    urljoin = require('url-join'),
    cuid = require('cuid'),
    os = require('os'),
    app = Express(),
    registered = false,
    timebelt = require('timebelt'),
    jobs = {};

(async function(){

    let settingsPath = null,
        settings = {
            coordinatorUrl : 'http://127.0.0.1:8082',
            registerInterval : 5000,
            maxJobs : 1,
            name : os.hostname,
            tags: '',
            port : 8081
        };

    if (await fs.exists('/etc/cibroker/slave.yml'))
        settingsPath = '/etc/cibroker/slave.yml' 
    else if (await fs.exists('./slave.yml'))
        settingsPath = './slave.yml'; 

    if (settingsPath){
        let rawSettings = await fs.readFile(settingsPath, 'utf8');
        try {
            settings = Object.assign(settings, yaml.safeLoad(rawSettings));
        } catch(ex){
            throw  `unable to to parse YML ${ex}`;
        }
    }

    // allow argv to override settings
    let argv = minimist(process.argv.slice(2));
    for (let property in argv)
        settings[property] = argv[property];    


    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());
    app.set('json spaces', 4);
    
    
    /**
     * 
     */    
    app.post('/v1/jobs', async function(req, res){
        try {
     
            if (!req.body.command){
                res.status(400);
                return res.end('--command not set');
            }

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
     * 
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
     * 
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
    
    // keep registered with coordinator
    setInterval(async function(){
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

    }, settings.registerInterval)
    
    var server = http.createServer(app);
    server.listen(settings.port);
    console.log(`Slave listening on port ${settings.port}`);
    
})()

