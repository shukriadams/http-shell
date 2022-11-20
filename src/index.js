const path = require('path'),
    jsonfile = require('jsonfile'),
    process = require('process'),
    minimist = require('minimist'),
    allowedModes = ['client', 'worker', 'coordinator'],
    argv = minimist(process.argv.slice(2))

if (argv.version){
    const package = jsonfile.readFileSync(path.join( __dirname, '/package.json'))
    console.log(`http-shell, version ${package.version}`)
    process.exit(0)
}

if (argv.help|| argv.h){
    console.log('Usage: http-shell [options...]')
    console.log(`-m, --mode     [client|worker|coordinator]`)
    process.exit(0)
}

let mode = argv.mode || argv.m

// set default mode to client
if (!mode){
    mode = 'client'
    console.log('--mode (-m) not set, defaulting to client')
}

if (!allowedModes.includes(mode)){
    console.log(`invalid mode "${mode}" - allowed values are [client|worker|coordinator]`)
    process.exit(1)
}

switch(mode){
    case 'worker':{
        require('./lib/worker')
        break
    }
    case 'client':{
        require('./lib/client')
        break
    }
    case 'coordinator':{
        require('./lib/coordinator')
        break
    }
}
