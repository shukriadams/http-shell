var http = require('http'),
    Express = require('express'),
    bodyParser = require('body-parser'),
    Settings = require('./settings'),
    app = Express(),
    slaves = {};

(async function(){

    try {

        let settings = await Settings({
                port: 8082,
                slaveTimeout: 10000
            }, [
                '/etc/cibroker/coordinator.yml',
                './coordinator.yml'
            ]);
        
        app.use(bodyParser.urlencoded({ extended: false }));
        app.use(bodyParser.json());
        app.set('json spaces', 4);
    
    
        /**
         * registers a slave
         */
        app.post('/v1/slaves/:name', async function(req, res){
            try {
                let name = decodeURIComponent(req.params.name.trim()),
                    ip = req.connection.remoteAddress,
                    registerInterval = parseInt((req.query.registerInterval || '0').trim()) || 0,
                    tags =  decodeURIComponent(req.query.tags || '').split(','),
                    slave = slaves[name];
                
                // remove empty tags, remote whitespace padding
                tags = tags.map((tag)=>{return tag.trim()});
                tags = tags.filter((tag)=>{ return tag.length > 0 });

                if (slave && slave.ip !== ip){
                    res.status(400);
                    return res.end(`another slave has claimed the name ${name}`);
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

                res.end('Slave registered');
            } catch(ex){
                console.log(ex);
                res.status(500);
                res.end(ex.toString());
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
                res.end(ex.toString());
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
                    return res.end(`Slave not found, or ip mismatch`);
                }
        
                delete slaves[name];
    
                console.log(`Slave ${id} deleted`);
                res.end();
            } catch(ex){
                console.log(ex);
                res.status(500);
                res.end(ex.toString());
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


