var http = require('http'),
    Express = require('express'),
    bodyParser = require('body-parser'),
    Settings = require('./settings'),
    app = Express(),
    slaves = {};

(async function(){

    try {

        let settings = await Settings({
                port: 8082,             // port to listen for incoming slave/client requests
                slaveTimeout: 10000,    // millseconds. Slaves must update their availability. If a slave hasn't checked in after this time, it is marked as unavailable
                slaveWhitelist : ''     // Will be converted to string array from comma-separated list. Allowed slave IPnrs. Use if you want to prevent rogue slaves.
            }, [
                '/etc/cibroker/coordinator.yml',
                './coordinator.yml'
            ]);
        
        // convert comma-separated list to array, remove empties
        settings.slaveWhitelist =  settings.slaveWhitelist.split(',').filter(i => i.trim().length > 0);

        app.use(bodyParser.urlencoded({ extended: false }));
        app.use(bodyParser.json());
        app.set('json spaces', 4);
    
    
        /**
         * Handles a slave registering itself.
         */
        app.post('/v1/slaves/:name', async function(req, res){
            try {
                let name = decodeURIComponent(req.params.name.trim()),
                    ip = req.connection.remoteAddress,
                    registerInterval = parseInt((req.query.registerInterval || '0').trim()) || 0,
                    tags =  decodeURIComponent(req.query.tags || '').split(','),
                    slave = slaves[name];
                
                // remove empty tags, remote whitespace padding
                tags = tags
                    .map(tag => tag.trim())
                    .filter(tag => tag.length > 0);

                if (slave && slave.ip !== ip){
                    res.status(400);
                    return res.json({ error : `Another slave has claimed the name ${name}` });
                }   

                if (settings.slaveWhitelist.length && !settings.slaveWhitelist.includes(ip)){
                    console.log(`Rejected slave registration from non-whitelisted ip ${ip} : ${settings.slaveWhitelist}`);
                    res.status(400);
                    return res.json({ error : 'You IP is not permitted - add it to coordinator whitelist' });
                }

                const isNew = !slave;
                slave = slave || {};
                slave.ip = ip;
                slave.tags = tags;
                slave.registerInterval = registerInterval;
                slave.lastContact = new Date();
                
                slaves[name] = slave;
        
                if (isNew)
                    console.log(`Slave ${name} registered @ ip ${ip}, tags : "${tags}"`);

                res.json({ message : 'Slave registered' });
            } catch(ex){
                console.log(ex);
                res.status(500);
                res.json({error : ex.toString() });
            }
        });
        
    
        /**
         * Gets a list of registered slaves
         */
        app.get('/v1/slaves', async function(req, res){
            try {
                res.json(slaves);
            } catch(ex){
                console.log(ex);
                res.status(500);
                res.json({ error : ex.toString() });
            }
        });
        
        
        /**
         * 
         */
        app.delete('/v1/slaves/:id', async function(req, res){
            try {
                let name = req.params.name,
                    ip = req.connection.remoteAddress,
                    slave = slaves[name];
    
                if (!slave ||slave.ip !== ip){
                    res.status(404);
                    return res.json({ error : `Slave not found, or ip mismatch` });
                }
        
                delete slaves[name];
    
                console.log(`Slave ${id} deleted`);
                res.json({});
            } catch(ex){
                console.log(ex);
                res.status(500);
                res.json({ error : ex.toString() });
            }
        });


        setInterval(async function(){
            try {
                for (const name in slaves){
                    let updateTime = new Date().getTime() - slaves[name].lastContact.getTime();
                    if (updateTime > settings.slaveTimeout && updateTime > slaves[name].registerInterval * 2){ // double intervall for some buffer
                        delete slaves[name];
                        console.log(`Slave ${name} timed out, removing.`);
                    }
                }
            } catch(ex){
                console.log('unexpected error in slave check', ex);
            }
        }, 500);

        var server = http.createServer(app);
        server.listen(settings.port);
        
        console.log(`Coordinator listening on port ${settings.port}`);
    } catch(ex) {
        console.log(ex);
    }
    
})()


