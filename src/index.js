const process = require('process'),
    minimist = require('minimist'),
    jsonfile = require('jsonfile'),
    path = require('path'),
    argv = minimist(process.argv.slice(2));

if (argv.version){
    let package = jsonfile.readFileSync(path.join( __dirname, '/package.json'));
    console.log(`buildbroker, version ${package.version}`);
    process.exit(0);
}
    
if (process.argv.length < 3){
    console.log('Missing argument - broker [client|slave|coordinator]');
    process.exit(1);
}

let funct = process.argv[2];
switch(funct){
    case 'slave':{
        require('./lib/slave');
        break;
    }
    case 'client':{
        require('./lib/client');
        break;
    }
    case 'coordinator':{
        require('./lib/coordinator');
        break;
    }
    default: {  
        console.log(`${funct} is not supported - used client|slave|coordinator`);
        process.exit(1);
    }
}
