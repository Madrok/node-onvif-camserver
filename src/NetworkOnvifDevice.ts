import * as onvif from 'node-onvif';

type IPAddress = string;
type MacAddress = string;
type URN = string;
type URL = string;
type WSDL_SCOPE = string;
type WSDL_TYPE = string;

export interface NetworkOnvifDevice { 
    urn: URN,
    name: string;
    address: IPAddress,
    hardware: string,
    location: string,
    mac: MacAddress;
    types: Array<WSDL_TYPE>,
    xaddrs: Array<URL>,
    scopes: Array<WSDL_SCOPE>,
    instance: onvif.OnvifDevice;
    connected: boolean;
    lastPing: number;
};

/*
* 10.0.0.0
  mac address -	00:2a:2a:2d:02:49
  urn -		urn:uuid:2733114e-5ace-a633-4a71-002a2a2d0249
  name -	IPD-E36Y0701-BS
  hardware -	IPcamera
  location -	china
  types -	
		dn:NetworkVideoTransmitter
  xaddrs -
		http://10.0.0.0:8899/onvif/device_service
  onvif scopes -	
		
		onvif://www.onvif.org/type/Network_Video_Transmitter
		onvif://www.onvif.org/type/video_encoder
		onvif://www.onvif.org/Profile/Streaming
		onvif://www.onvif.org/type/video_analytics
		onvif://www.onvif.org/type/audio_encoder
		onvif://www.onvif.org/type/ptz
		onvif://www.onvif.org/location/country/china
		onvif://www.onvif.org/hardware/IPcamera
		onvif://www.onvif.org/name/IPD-E36Y0701-BS
        onvif://www.onvif.org/scope_configurable
*/