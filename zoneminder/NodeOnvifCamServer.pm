# ==========================================================================
#
# ZoneMinder Onvif Cam Server IP Control Protocol Module
# Copyright (C) 2019 by Russell Weir
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
#
# ==========================================================================
#
# This module contains the first implementation of the Reolink IP camera control
# protocol
#
package ZoneMinder::Control::NodeOnvifCamServer;

use 5.006;
use strict;
use warnings;

require ZoneMinder::Base;
require ZoneMinder::Control;

our @ISA = qw(ZoneMinder::Control);

our %CamParams = ();

# ==========================================================================
#
# Onvif Cam Server client module for Zoneminder
#
# This module connects to the Onvif Cam Server to control any network
# camera that it discovers.
#
#
# The Control Device field may be left blank, as the OnvifCamServer will
# auto-discover the control points on any Onvif compliant device. Typically
# the URI is /onvif/device_service. In future releases, this field will be
# passed to the cam server as a hint in case it can not connect to a
# semi-compatible onvif camera.
#
# In ControlAddress use the format:
#   USERNAME:PASSWORD@ADDRESS:PORT
#   eg : admin:pass@10.1.2.1:8899
#        admin:password@10.0.100.1:8899
#
# Ports 8899 and 8999 are common in onvif cameras. Since the server does
# auto-network detection, it's even unlikely that you need to specify the
# port, but you will need to provide the username and password if they are
# required by the camera.
#
# Make sure to place a value in the Auto Stop Timeout field.
# Recommend starting with a value of 1 second, and adjust accordingly.
#
# Note that the OnvifCamServer must be running on the same machine, as it
# currently uses Unix domain sockets for communicating with this client.
#
# ==========================================================================

use ZoneMinder::Logger qw(:all);
use ZoneMinder::Config qw(:all);

use Time::HiRes qw( usleep );

use MIME::Base64;
use Digest::SHA;
use DateTime;

use IO::Socket::UNIX;
use JSON;

my $SOCK_PATH = "/var/run/oncam/oncam.sock";
my ( $username, $password, $host, $port, $endpoint, $sock );

# sub new
# {
#     my $class = shift;
#     my $id = shift;
#     my $self = ZoneMinder::Control->new( $id );
#     bless( $self, $class );
#     srand( time() );
#     return $self;
# }

# our $AUTOLOAD;

# sub AUTOLOAD
# {
#    my $self = shift;
#    my $class = ref($self) || croak( "$self not object" );
#    my $name = $AUTOLOAD;
#    $name =~ s/.*://;
#    if ( exists($self->{$name}) )
#    {
#        return( $self->{$name} );
#    }
#    Fatal( "Can't access $name member of object of class $class" );
# }

sub open {
    my $self = shift;

    $self->loadMonitor();
    #
    # Extract the username/password host/port from ControlAddress
    #
    $endpoint = $self->{Monitor}{ControlDevice};
    if ( $self->{Monitor}{ControlAddress} =~ /^([^:]+):([^@]+)@(.+)/ ) {

        # user:pass@host...
        $username = $1;
        $password = $2;
        $host     = $3;
    }
    elsif ( $self->{Monitor}{ControlAddress} =~ /^([^@]+)@(.+)/ ) {

        # user@host...
        $username = $1;
        $host     = $2;
    }
    else {    # Just a host
        $host = $self->{Monitor}{ControlAddress};
    }

    # Check if it is a host and port or just a host
    if ( $host =~ /([^:]+):(.+)/ ) {
        $host = $1;
        $port = $2;
    }
    else {
        $port = 80;
    }

    # Client:
    $sock = IO::Socket::UNIX->new(
        Type => SOCK_STREAM(),
        Peer => $SOCK_PATH,
    );
    if ( not $sock ) {
        Warn( "Unable to connect to " . $SOCK_PATH );
        exit 1;
    }

    use LWP::UserAgent;
    $self->{ua} = LWP::UserAgent->new;
    $self->{ua}
      ->agent( "ZoneMinder Control Agent/" . ZoneMinder::Base::ZM_VERSION );

    my $connectMsg = {
        'method' => 'connect',
        'params' => {
            'address' => $host,
            'user'    => $username,
            'pass'    => $password,
        }
    };
    $self->sendMsg($connectMsg);

    $self->{state} = 'open';
}

sub printMsg {
    my $self    = shift;
    my $msg     = shift;
    my $msg_len = length($msg);

    Debug( $msg . "[" . $msg_len . "]" );
}

sub sendCmd {
    my $self   = shift;
    my $msg    = shift;
    my $result = undef;

    $msg = encode_json($msg);
    $sock->send($msg);

    $result = <$sock>;
    chomp($result);
    my $data = decode_json($result);

    if ( $data->error ) {
        Error(  "Camera command '"
              . $msg->{'method'}
              . "' failed: '"
              . $result->error
              . "'" );
    }
    else {
        $result = !undef;
    }
    return ($result);
}

sub sendMsg {
    my $self = shift;
    my $msg  = shift;
    $msg = encode_json($msg);
    Info($msg);

    $sock->send($msg);
    my $resp = <$sock>;
    chomp($resp);
    Info($resp);
    my $data = decode_json($resp);
}

#sub getCamParams
#{
#    my $self = shift;
#    my $msg = $self->onvifAuthHeader().
#            '<soap:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><GetImagingSettings xmlns="http://www.onvif.org/ver20/imaging/wsdl"><VideoSourceToken>000</VideoSourceToken></GetImagingSettings></s:Body></s:Envelope>';
#    my $server_endpoint = "http://".$self->{Monitor}->{ControlAddress}."/onvif/imaging";
#    my $req = HTTP::Request->new( POST => $server_endpoint );
#    $req->header('content-type' => 'application/soap+xml; charset=utf-8; action="http://www.onvif.org/ver20/imaging/wsdl/GetImagingSettings"');
#    $req->header('Host' => $host.":".$port);
#    $req->header('content-length' => length($msg));
#    $req->header('accept-encoding' => 'gzip, deflate');
#    $req->header('connection' => 'Close');
#    $req->content($msg);

#    my $res = $self->{ua}->request($req);

#    if ( $res->is_success ) {
#        # We should really use an xml or soap library to parse the xml tags
#        my $content = $res->decoded_content;
#        Info($content);
#
#        if ($content =~ /.*<tt:(Brightness)>(.+)<\/tt:Brightness>.*/) {
#            $CamParams{$1} = $2;
#        }
#        if ($content =~ /.*<tt:(Contrast)>(.+)<\/tt:Contrast>.*/) {
#            $CamParams{$1} = $2;
#        }
#    }
#    else
#    {
#        Error( "Unable to retrieve camera image settings:'".$res->status_line()."'" );
#    }
#}

#autoStop
#This makes use of the ZoneMinder Auto Stop Timeout on the Control Tab
sub autoStop {
    my $self     = shift;
    my $autostop = shift;

    if ($autostop) {
        Debug( "Autostop " . $self->{Monitor}->{AutoStopTimeout} );
        usleep($autostop);
        $self->moveStop();
    }

    #my $autostop = $self->getParam( $params, 'autostop', 0 );
    #if ( $autostop && $self->{Monitor}->{AutoStopTimeout} && $direction != 0) {
    #    Info("Autostop ".$self->{Monitor}->{AutoStopTimeout});
    #    usleep( $self->{Monitor}->{AutoStopTimeout} );
    #    $self->moveStop();
    #}
}

# Reset the Camera
#sub reset
#{
#    Debug( "Camera Reset" );
#    my $self = shift;
#    my $cmd = "";
#    my $msg = $self->onvifAuthHeader().
#            '<soap:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><SystemReboot xmlns="http://www.onvif.org/ver10/device/wsdl"/></s:Body></s:Envelope>';
#    my $content_type = 'application/soap+xml; charset=utf-8; action="http://www.onvif.org/ver10/device/wsdl/SystemReboot"';
#    $self->sendCmd( $cmd, $msg, $content_type );
#}

# scale the 0-100 value from zoneminder to a 0.0-1.0
# value expected by onvif
sub moveSpeedCalc {
    my $self = shift;
    my $v    = shift;

    Info("Speed is: $v");
    if ( $v < 0 )   { $v = 0 - $v; }
    if ( $v > 100 ) { $v = 100; }
    return $v / 100;
}

sub MoveVector {
    Info("-- move --*");
    my $self      = shift;
    my $direction = shift;
    my $params    = shift;

    my $panSpeed =
      $self->moveSpeedCalc( $self->getParam( $params, 'panspeed', 0 ) );
    my $tiltSpeed =
      $self->moveSpeedCalc( $self->getParam( $params, 'tiltspeed', 0 ) );
    my $zoomSpeed =
      $self->moveSpeedCalc( $self->getParam( $params, 'zoomspeed', 0 ) );
    my $speed = $self->getParam( $params, 'speed', -1 );

    if ( $speed > -1 ) {
        $tiltSpeed = $panSpeed = $self->moveSpeedCalc($speed);
    }
    if ( $direction == 1 ) { }
    if ( $direction >= 5 && $direction <= 7 ) { $tiltSpeed = 0 - $tiltSpeed }
    if ( $direction == 7 ) { $panSpeed = 0 - $panSpeed }
    Info( "tilt,pan,speed are " . $tiltSpeed . "," . $panSpeed . "," . $speed );

    my $msg = {
        'method' => 'ptzMove',
        'params' => {
            'address' => $host,
            'speed'   => {
                'x' => 0 + $panSpeed,
                'y' => 0 + $tiltSpeed,
                'z' => 0 + $zoomSpeed
            },
        },
    };

    $self->sendMsg($msg);
    $self->autoStop( $self->{Monitor}->{AutoStopTimeout} );
}

sub moveStop {
    Info("-- moveStop ---");
    my $self = shift;
    my $msg  = {
        'method' => 'ptzStop',
        'params' => {
            'address' => $host,
        }
    };
    $self->sendMsg($msg);
}

sub moveConUp {
    Info("-- moveConUp ---");
    my $self   = shift;
    my $params = shift;

    # Warn("moveConUp: ".to_json($params));
    $self->MoveVector( 1, $params );
}

sub moveConUpRight {
    Info("-- moveConUpRight ---");
    my $self   = shift;
    my $params = shift;

    #   Warn("moveConUpRight: ".to_json($params));
    $self->MoveVector( 2, $params );
}

sub moveConRight {
    Info("-- moveConRight ---");
    my $self   = shift;
    my $params = shift;

    #Warn("moveConUpRight: ".to_json($params));
    $self->MoveVector( 3, $params );
}

sub moveConDownRight {
    Info("-- moveConDownRight ---");
    my $self   = shift;
    my $params = shift;

    # Warn("moveConDownRight: ".to_json($params));
    $self->MoveVector( 4, $params );
}

sub moveConDown {
    Info("-- moveConDown ---");
    my $self   = shift;
    my $params = shift;

    # Warn("moveConDown: ".to_json($params));
    $self->MoveVector( 5, $params );
}

sub moveConDownLeft {
    Info("-- moveConDownLeft ---");
    my $self   = shift;
    my $params = shift;

    #   Warn("moveConDownLeft: ".to_json($params));
    $self->MoveVector( 6, $params );
}

sub moveConLeft {
    Info("-- moveConLeft ---");
    my $self   = shift;
    my $params = shift;

    #   Warn("moveConLeft: ".to_json($params));
    $self->MoveVector( 7, $params );
}

sub moveConUpLeft {
    Info("-- moveConUpLeft ---");
    my $self   = shift;
    my $params = shift;

    #   Warn("moveConUpLeft: ".to_json($params));
    $self->MoveVector( 8, $params );
}

#sub zoomFocusIris {
#  Info("zoomFocusIris");
#  my $self = shift;
#  my $cmd = shift;
#  my $params = shift;

#  my $cmd = "form/setPTZCfg?command=$cmd&ZFSpeed=0&PTSpeed=0&panSpeed=6&tiltSpeed=6";
#  $self->sendCmd($cmd);
#  #usleep(500000);
#  $self->moveStop();
#}

sub irisConOpen {
    my $self   = shift;
    my $params = shift;
    $self->zoomFocusIris( 9, $params );
}

sub irisConClose {
    my $self   = shift;
    my $params = shift;
    $self->zoomFocusIris( 10, $params );
}

sub focusConNear {
    my $self   = shift;
    my $params = shift;
    $self->zoomFocusIris( 11, $params );
}

sub focusConFar {
    my $self   = shift;
    my $params = shift;
    $self->zoomFocusIris( 12, $params );
}

sub focusStop {
    my $self   = shift;
    my $params = shift;
    $self->moveStop();
}

sub zoomConTele {
    my $self   = shift;
    my $params = shift;
    $self->zoomFocusIris( 13, $params );
}

sub zoomConWide {
    my $self   = shift;
    my $params = shift;
    $self->zoomFocusIris( 14, $params );
}

sub zoomStop {
    my $self   = shift;
    my $params = shift;
    $self->moveStop();
}

sub presetHome {
    my $self   = shift;
    my $params = shift;
    Info("Goto Preset home");
    my $msg = {
        'method' => 'ptzHome',
        'params' => {
            'address' => $host,
            'speed'   => {
                'x' => 1.0,
                'y' => 1.0,
                'z' => 1.0
            },
        },
    };
    $self->sendMsg($msg);
}

#Recall Camera Preset
sub presetGoto {
    my $self   = shift;
    my $params = shift;
    my $preset = $self->getParam( $params, 'preset' );
    my $num    = sprintf( "%03d", $preset );

    #$num=~ tr/ /0/;
    Info("Goto Preset $preset");
    my $msg = {
        'method' => 'gotoPreset',
        'params' => {
            'address'     => $host,
            'PresetToken' => $num,
            'Speed'       => {
                'x' => 1.0,
                'y' => 1.0,
                'z' => 1.0
            },
        },
    };

    #$self->sendCmd( $cmd, $msg, $content_type );
    $self->sendMsg($msg);
}

#Set Camera Preset
sub presetSet {
    my $self   = shift;
    my $params = shift;
    my $preset = $self->getParam( $params, 'preset' );
    Debug("Set Preset $preset");
    my $cmd = 'onvif/PTZ';
    my $msg =
        $self->onvifAuthHeader()
      . '<soap:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><SetPreset xmlns="http://www.onvif.org/ver20/ptz/wsdl"><ProfileToken>000</ProfileToken><PresetToken>'
      . $preset
      . '</PresetToken></SetPreset></s:Body></s:Envelope>';
    my $content_type =
'application/soap+xml; charset=utf-8; action="http://www.onvif.org/ver20/ptz/wsdl/SetPreset"';
    $self->sendCmd( $cmd, $msg, $content_type );
}

#Horizontal Patrol
#To be determined if this camera supports this feature
sub horizontalPatrol {
    Debug("Horizontal Patrol");
    my $self         = shift;
    my $cmd          = '';
    my $msg          = '';
    my $content_type = '';

    #    $self->sendCmd( $cmd, $msg, $content_type );
    Error("PTZ Command not implemented in control script.");
}

#Horizontal Patrol Stop
#To be determined if this camera supports this feature
sub horizontalPatrolStop {
    Debug("Horizontal Patrol Stop");
    my $self         = shift;
    my $cmd          = '';
    my $msg          = '';
    my $content_type = '';

    #    $self->sendCmd( $cmd, $msg, $content_type );
    Error("PTZ Command not implemented in control script.");
}

# Increase Brightness
sub irisAbsOpen {
    Debug("Iris $CamParams{'Brightness'}");
    my $self   = shift;
    my $params = shift;
    $self->getCamParams() unless ( $CamParams{'Brightness'} );
    my $step = $self->getParam( $params, 'step' );
    my $max  = 100;

    $CamParams{'Brightness'} += $step;
    $CamParams{'Brightness'} = $max if ( $CamParams{'Brightness'} > $max );

    my $cmd = 'onvif/imaging';
    my $msg =
        $self->onvifAuthHeader()
      . '<soap:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><SetImagingSettings xmlns="http://www.onvif.org/ver20/imaging/wsdl"><VideoSourceToken>000</VideoSourceToken><ImagingSettings><Brightness xmlns="http://www.onvif.org/ver10/schema">'
      . $CamParams{'Brightness'}
      . '</Brightness></ImagingSettings><ForcePersistence>true</ForcePersistence></SetImagingSettings></s:Body></s:Envelope>';
    my $content_type =
'application/soap+xml; charset=utf-8; action="http://www.onvif.org/ver20/imaging/wsdl/SetImagingSettings"';
    $self->sendCmd( $cmd, $msg, $content_type );
}

# Decrease Brightness
sub irisAbsClose {
    Debug("Iris $CamParams{'Brightness'}");
    my $self   = shift;
    my $params = shift;
    $self->getCamParams() unless ( $CamParams{'brightness'} );
    my $step = $self->getParam( $params, 'step' );
    my $min  = 0;

    $CamParams{'Brightness'} -= $step;
    $CamParams{'Brightness'} = $min if ( $CamParams{'Brightness'} < $min );

    my $cmd = 'onvif/imaging';
    my $msg =
        $self->onvifAuthHeader()
      . '<soap:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><SetImagingSettings xmlns="http://www.onvif.org/ver20/imaging/wsdl"><VideoSourceToken>000</VideoSourceToken><ImagingSettings><Brightness xmlns="http://www.onvif.org/ver10/schema">'
      . $CamParams{'Brightness'}
      . '</Brightness></ImagingSettings><ForcePersistence>true</ForcePersistence></SetImagingSettings></s:Body></s:Envelope>';
    my $content_type =
'application/soap+xml; charset=utf-8; action="http://www.onvif.org/ver20/imaging/wsdl/SetImagingSettings"';
    $self->sendCmd( $cmd, $msg, $content_type );
}

# Increase Contrast
sub whiteAbsIn {
    Debug("Iris $CamParams{'Contrast'}");
    my $self   = shift;
    my $params = shift;
    $self->getCamParams() unless ( $CamParams{'Contrast'} );
    my $step = $self->getParam( $params, 'step' );
    my $max  = 100;

    $CamParams{'Contrast'} += $step;
    $CamParams{'Contrast'} = $max if ( $CamParams{'Contrast'} > $max );

    my $cmd = 'onvif/imaging';
    my $msg =
        $self->onvifAuthHeader()
      . '<soap:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><SetImagingSettings xmlns="http://www.onvif.org/ver20/imaging/wsdl"><VideoSourceToken>000</VideoSourceToken><ImagingSettings><Contrast xmlns="http://www.onvif.org/ver10/schema">'
      . $CamParams{'Contrast'}
      . '</Contrast></ImagingSettings><ForcePersistence>true</ForcePersistence></SetImagingSettings></s:Body></s:Envelope>';
    my $content_type =
'application/soap+xml; charset=utf-8; action="http://www.onvif.org/ver20/imaging/wsdl/SetImagingSettings"';
}

# Decrease Contrast
sub whiteAbsOut {
    Debug("Iris $CamParams{'Contrast'}");
    my $self   = shift;
    my $params = shift;
    $self->getCamParams() unless ( $CamParams{'Contrast'} );
    my $step = $self->getParam( $params, 'step' );
    my $min  = 0;

    $CamParams{'Contrast'} -= $step;
    $CamParams{'Contrast'} = $min if ( $CamParams{'Contrast'} < $min );

    my $cmd = 'onvif/imaging';
    my $msg =
        $self->onvifAuthHeader()
      . '<soap:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><SetImagingSettings xmlns="http://www.onvif.org/ver20/imaging/wsdl"><VideoSourceToken>000</VideoSourceToken><ImagingSettings><Contrast xmlns="http://www.onvif.org/ver10/schema">'
      . $CamParams{'Contrast'}
      . '</Contrast></ImagingSettings><ForcePersistence>true</ForcePersistence></SetImagingSettings></s:Body></s:Envelope>';
    my $content_type =
'application/soap+xml; charset=utf-8; action="http://www.onvif.org/ver20/imaging/wsdl/SetImagingSettings"';
}

1;
__END__
