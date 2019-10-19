let config = {
	processUser: 'www-data',
	processGroup: 'www-data',
	pidFile: "/var/run/oncam/oncam.pid",
	socket: "/var/run/oncam/oncam.sock",
	discoveryTime: 1000 * 60 * 10,
	httpEnabled: false,
	httpPort: 8880,
};

export default config;