/**
 * This utility displays all the onvif cameras on the network
 */
import { NetworkOnvifDevice } from './NetworkOnvifDevice';
import { onvifDiscover } from './OnvifDiscover';


console.log('Searching for cameras.');

function displayResults(results:Array<NetworkOnvifDevice>) {
    results.forEach((d: NetworkOnvifDevice)=>{
        console.log("");
        console.log('* ' + d.address);
        console.log('  mac address -\t'+d.mac);
        console.log('  urn -\t\t' + d.urn);
        console.log('  name -\t' + d.name);
        console.log('  hardware -\t' + d.hardware);
        console.log('  location -\t' + d.location);
        console.log('  types -\t');
        for(var t in d.types) {
            console.log('\t\t' + d.types[t]);
        }
        console.log('  xaddrs -');
        for(var t in d.xaddrs) {
            console.log('\t\t' + d.xaddrs[t]);
        }
        
        console.log('  onvif scopes -\t');
        for(var t in d.scopes) {
            console.log('\t\t' + d.scopes[t]);
        }
    });
}

// Find the ONVIF network cameras.
// It will take about 3 seconds.
// onvifDiscover(function(err, results:Array<NetworkOnvifDevice>) {
//     if(err) {
//         console.log(err);
//         return;
//     }
//     displayResults(results);
// });

onvifDiscover().then((results)=>displayResults(results));




/*
onvif.startProbe().then((device_info_list) => {
  console.log(device_info_list.length + ' devices were found.');
  // Show the device name and the URL of the end point.
  device_info_list.forEach((info) => {
        
        console.log("");
        let odevice = new onvif.OnvifDevice({
            xaddr: info.xaddrs[0]
        });
        arp.getMAC(odevice.address, function(err, mac) {
            var macAddr = "unknown"
            if (!err) {
                macAddr = mac;
            }

            var d : NetworkOnvifDevice = {
                urn: info.urn,
                name: info.name,
                address: odevice.address,
                hardware: info.hardware,
                location: info.location,
                mac: macAddr,
                types: info.types,
                xaddrs: info.xaddrs,
                scopes: info.scopes,
                instance: odevice,
                connected: false,
                lastPing: 0,
            }
            /*
            device.instance.setAuth(params.user, params.pass);
            odevice.init((error, result) => {
                var res = {'id': 'connect'};
                if(error) {
                    res['error'] = error.toString();
                } else {
                    res['result'] = result;
                }
                console.log(res);
            });
            
            console.log('* ' + odevice.address);
            console.log('  mac address -\t'+macAddr);
            console.log('  urn -\t\t' + info.urn);
            console.log('  name -\t' + info.name);
            console.log('  hardware -\t' + info.hardware);
            console.log('  location -\t' + info.location);
            console.log('  types -\t');
            for(var t in info.types) {
                console.log('\t\t' + info.types[t]);
            }
            console.log('  xaddrs -');
            for(var t in info.xaddrs) {
                console.log('\t\t' + info.xaddrs[t]);
            }
            
            console.log('  onvif scopes -\t');
            for(var t in info.scopes) {
                console.log('\t\t' + info.scopes[t]);
            }
        });
  });
}).catch((error) => {
  console.error(error);
});
*/
