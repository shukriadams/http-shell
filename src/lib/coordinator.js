var http = require('http'),
    Express = require('express'),
    bodyParser = require('body-parser'),
    Settings = require('./settings'),
    app = Express(),
    workers = {};

(async function(){

    try {

        let settings = await Settings({
                port: 8082,             // port to listen for incoming worker/client requests
                workerTimeout: 10000,    // millseconds. Workers must update their availability. If a worker hasn't checked in after this time, it is marked as unavailable
                workerWhitelist : ''     // Will be converted to string array from comma-separated list. Allowed worker IPnrs. Use if you want to prevent rogue workers.
            }, [
                '/etc/cibroker/coordinator.yml',
                './coordinator.yml'
            ])
        
        // convert comma-separated list to array, remove empties
        settings.workerWhitelist =  settings.workerWhitelist.split(',').filter(i => i.trim().length > 0)

        app.use(bodyParser.urlencoded({ extended: false }))
        app.use(bodyParser.json())
        app.set('json spaces', 4)
    
    
        /**
         * Handles a worker registering itself.
         */
        app.post('/v1/workers/:name', async function(req, res){
            try {
                let name = decodeURIComponent(req.params.name.trim()),
                    ip = req.connection.remoteAddress,
                    registerInterval = parseInt((req.query.registerInterval || '0').trim()) || 0,
                    tags =  decodeURIComponent(req.query.tags || '').split(','),
                    worker = workers[name]
                
                // remove empty tags, remote whitespace padding
                tags = tags
                    .map(tag => tag.trim())
                    .filter(tag => tag.length > 0)

                if (worker && worker.ip !== ip){
                    res.status(400)
                    return res.json({ error : `Another worker has claimed the name ${name}` })
                }   

                if (settings.workerWhitelist.length && !settings.workerWhitelist.includes(ip)){
                    console.log(`Rejected worker registration from non-whitelisted ip ${ip} : ${settings.workerWhitelist}`)
                    res.status(400)
                    return res.json({ error : 'You IP is not permitted - add it to coordinator whitelist' })
                }

                const isNew = !worker
                worker = worker || {}
                worker.ip = ip
                worker.tags = tags
                worker.registerInterval = registerInterval
                worker.lastContact = new Date()
                
                workers[name] = worker
        
                if (isNew)
                    console.log(`Worker ${name} registered @ ip ${ip}, tags : "${tags}"`)

                res.json({ message : 'Worker registered' })
            } catch(ex){
                console.log(ex)
                res.status(500)
                res.json({error : ex.toString() })
            }
        })
        
    
        /**
         * Gets a list of registered workers
         */
        app.get('/v1/workers', async function(req, res){
            try {
                res.json(workers)
            } catch(ex){
                console.log(ex)
                res.status(500)
                res.json({ error : ex.toString() })
            }
        })
        
        
        /**
         * 
         */
        app.delete('/v1/workers/:id', async function(req, res){
            try {
                let name = req.params.name,
                    ip = req.connection.remoteAddress,
                    worker = workers[name]
    
                if (!worker ||worker.ip !== ip){
                    res.status(404)
                    return res.json({ error : `Worker not found, or ip mismatch` })
                }
        
                delete workers[name]
    
                console.log(`Worker ${id} deleted`)
                res.json({})
            } catch(ex){
                console.log(ex)
                res.status(500)
                res.json({ error : ex.toString() })
            }
        })


        setInterval(async function(){
            try {
                for (const name in workers){
                    let updateTime = new Date().getTime() - workers[name].lastContact.getTime()
                    if (updateTime > settings.workerTimeout && updateTime > workers[name].registerInterval * 2){ // double intervall for some buffer
                        delete workers[name]
                        console.log(`Worker ${name} timed out, removing.`)
                    }
                }
            } catch(ex){
                console.log('unexpected error in worker check', ex)
            }
        }, 500)

        var server = http.createServer(app)
        server.listen(settings.port)
        
        console.log(`Coordinator listening on port ${settings.port}`)
    } catch(ex) {
        console.log(ex)
    }
    
})()