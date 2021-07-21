import * as onvif from 'node-onvif';
import * as arp from 'node-arp';
import { NetworkOnvifDevice } from './NetworkOnvifDevice';
import { logger } from './main';
import * as toBool from 'to-boolean';

/**
 * Find all network cameras. Will return a Promise if callback is null.
 * @param cb Callback taking Array<NetworkOnvifDevice>
 */
export function onvifDiscover(cb?:{(err:Error,results: Array<NetworkOnvifDevice>): void})  {
    let rv = [];
    let promises : Promise<void>[] = [];
    let f = (cb) => {
        onvif.startProbe().then((device_info_list) => {
            onvif.stopProbe((error)=> {
                if(toBool(process.env.NOCS_DEBUG_DEVICE_LIST || false))
                    console.log(device_info_list);
                device_info_list.forEach((info) => {   
                    let odevice = new onvif.OnvifDevice({
                        xaddr: info.xaddrs[0]
                    });
                    promises.push(new Promise((resolve,reject) => {
                        arp.getMAC(odevice.address, function(err, mac) {
                            var macAddr = "unknown";
                            if (!err) {
                                // console.log("mac for", odevice.address, " ", mac);
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
                            };
                            rv.push(d);
                            logger.debug(`OnvifDiscover found camera: ${d.hardware} at ${d.address}`);
                            resolve();
                        });
                    }));
                });
                Promise.all(promises).then(() => {
                    // console.log("success", rv);
                    if(cb)
                        cb(null, rv);
                });
            });
        }).catch((err) => {
            if(cb)
                cb(err, rv);
        });
    }
    if(cb == null || cb == undefined || typeof(cb) !== 'function') {
        return new Promise((resolve:{(results:Array<NetworkOnvifDevice>):void},reject)=>{
            f((err,results)=>{
                if(err) reject(err);
                else resolve(results);
            });
        });
    } else {
        f(cb);
    }
}

