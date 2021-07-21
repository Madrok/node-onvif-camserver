# node-onvif-camserver
Onvif camera discovery and control daemon


# About
node-onvif-camserver (NOCS) finds Onvif enabled cameras on the local network. These can then be controlled
through a connection to NOCS through a unix socket, or through websockets (planned, not yet implemented)

NOCS can be used with Zoneminder and comes with a Control plugin.

# Setup
Copy the .env.sample file to .env and edit it.
  * set a non-priviledged user and group for NOCS to run as, like www
  * set the location for a PID file
  * set the location for the unix domain socket
  * NOCS_DISCOVERY_TIME sets the number of seconds between onvif probes to find new cameras
  * NOCS_HTTP_ENABLED will turn on websocket support (not complete)
  * NOCS_DEBUG_DEVICE_LIST if set to true will dump all the information found from cameras after each discovery

# ZoneMinder Usage
This module connects to the Onvif Cam Server to control any network
camera that it discovers.

## ZoneMinder Installation
Edit in place or make a copy of the file zoneminder/NodeOnvifCamServer.pm .
In it, you will need to set the NOCS unix socket path to the same value you
use in your .env file for NOCS.

```perl my $SOCK_PATH = "/var/run/oncam/oncam.sock";```

Copy this file into the ZoneMinder control directory.
This is typically at ```/usr/share/perl5/ZoneMinder/Control/```

### Creating a control

1. Set up the montior device using normal onvif discovery.
2. Go to the control tab on the monitor settings and turn on 'controllable'
3. Click 'edit' next to the control type dropdown
4. Click the "+" symbol for "Add new control"
5. Set the name to "Node Onvif Cam Server" (this can be called anything you like, but this is easy to remember)
6. Set the Type to "Remote"
7. For Protocol, enter "NodeOnvifCamServer". This must be exact with no spaces.
8. Under Move check "Can Move", "Can Move Diagonally", "Can Move Continuous"
9. Unde Pan, check "Can Pan" and "Has Pan Speed". Set "Min Pan Speed" to 0 and "Max Pan Speed" to 100
10. Do the same for "Tilt".
11. For Zoom set "Can Zoom", "Can Zoom Continuous", "Has Zoom Speed" and set the min and max speed to 0 and 100.
12. Under Presets, if you camera does have presets check the boxes and add how many presets.
13. Other sections may have to be set as they may work at some point and with some cameras, but for now just click "Save"

### Set up the Monitor 
Go back to your Monitor settings for the camera
1. Set "Control Device" to /onvif/device_service (this is not yet used, but may be in future releases)
2. Under "Control Address", put in username:password@[camera ip address]:[onvif port]
3. You can set an "Auto Stop Timeout" if you want movements to stop within a certain number of seconds

The *onvif port* should either be 8899 or 8999. You can check your camera by using telnet ```telnet camera_ip 8899```

The Control Device field may be left blank, as the OnvifCamServer will
auto-discover the control points on any Onvif compliant device. Typically
the URI is /onvif/device_service. In future releases, this field will be
passed to the cam server as a hint in case it can not connect to a
semi-compatible onvif camera.

In ControlAddress use the format:
  USERNAME:PASSWORD@ADDRESS:PORT
  eg : admin:pass@10.1.2.1:8899
       admin:password@10.0.100.1:8899
  

# Running
NodeOnvifCamServer must be running on the same machine, as it
currently uses Unix domain sockets for communicating with Zoneminder.

You can launch it with ```yarn run run```, but it is better to 
have it run under a node process manager like [pm2](https://pm2.keymetrics.io/).

