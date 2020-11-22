const path = require('path'),
    jsonfile = require('jsonfile'),
    process = require('process'),
    minimist = require('minimist'),
    argv = minimist(process.argv.slice(2))

if (argv.version){
    const package = jsonfile.readFileSync(path.join( __dirname, '/package.json'))
    console.log(`buildbroker, version ${package.version}`)
    process.exit(0)
}

const mode = argv.mode
if (!mode){
    console.log('--mode required. Allowed values are [client|worker|coordinator]')
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
    default: {  
        console.log(`Invalid mode "${mode}" - use [client|worker|coordinator]`)
        process.exit(1)
    }
}
