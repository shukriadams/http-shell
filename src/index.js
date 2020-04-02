const process = require('process');

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
