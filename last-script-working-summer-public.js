 // this script allows to read consumption and production from a solarlog base, and set output

// some global variables, put here the solarlog server ip
let SolarLogServer = "http://192.168.1.xxx/getjp";

// Create JSON for request of consumption
let SolarLogCmd = {
	"782": null
};

let PIKO1 = 0;
let PIKO2 = 0;
let production = 0;
let consumption_garage = 0;
let consumption_houses = 0;
let temperature = 70;
let json_solarlog;
let history_solar = [0,0,0,0,0,0,0,0];
let decision_solar = 0;
let decision_solar_filtered = 0;
let decision_lowtemp = 0;
let timeout_http_connections = 60;

// Define timespan: minutes * 60 sec * 1000 milliseconds
// we scan every minute
let interval = 1 * 60 * 1000;

// Define amount used by heater
let extra_consumption = 2750;

function process_result(result, error_code, error) {
  if (error_code !== 0) {
    print("ERROR HTTP");
  } else {
    json_solarlog = JSON.parse(result.body);
    Shelly.call(
      "temperature.getStatus",
      { id: 100 },
      function (result) {  
         temperature = result["tC"];
         print(temperature);
      },
      null
    );
    // addition des deux onduleurs PIKO
    PIKO1 = JSON.parse(json_solarlog["782"]["21"]);
    PIKO2 = JSON.parse(json_solarlog["782"]["22"]);
    production = PIKO1+PIKO2;
    // CCgénéral
    consumption_houses = JSON.parse(json_solarlog["782"]["0"]);
    consumption_garage = JSON.parse(json_solarlog["782"]["2"]);
    print("on y va: temp, prod, cons_h, cons_g"); 
    print(temperature);
    print(production);
    print(consumption_houses);
    print(consumption_garage);

    // here we look for extra consumption if OFF, or just for sufficient production if ON
    if(production > (consumption_houses+consumption_garage-(extra_consumption*(decision_solar_filtered-1)))) {
      print("sufficient production");
      decision_solar = 1;
    }
    else {
      print("NOT sufficient production");
      decision_solar = 0;
    }
    
    // now check temperature and decision on low temperature
    if(temperature < 25) {
      decision_lowtemp = 1;
    }
    if(temperature > 55) {
      decision_lowtemp = 0;
    }

    //filtering based on solar decision history, we want to have a constant positive decision over a given period
    for (let i=0; i<((history_solar.length)-1); i++) {
       history_solar[i]=history_solar[i+1];
    }
    history_solar[(history_solar.length)-1] = decision_solar;

    print("history");
    for (let i in history_solar) {
       print(history_solar[i]);
    }

    //decision taken using the history
    decision_solar_filtered = 0;
    for (let i=0; i<history_solar.length; i++) {
       decision_solar_filtered = decision_solar_filtered + history_solar[i];
    }
    if (decision_solar_filtered===history_solar.length) { 
      decision_solar_filtered=1; 
    } else {
      decision_solar_filtered=0;
    }

    // decision based on solar availability OR too low temperature
    if((decision_solar_filtered===1)||(decision_lowtemp===1)) {
      print("heating");
      Shelly.call(
        "HTTP.GET", {
          "url": "http://192.168.1.203/relay/0/?turn=on",
          "timeout": timeout_http_connections,
        },
        function(result) {
          print("switched ON");
        }
      );
      Shelly.call("Switch.set", {'id': 0, 'on': true});
    }
    else {
      print("NOT heating");
      Shelly.call(
        "HTTP.GET", {
          "url": "http://192.168.1.203/relay/0/?turn=off",
          "timeout": timeout_http_connections,
        },
        function(result) {
          print("switched OFF");
        }
      );
    // local switch mirroring the heater
    Shelly.call("Switch.set", {'id': 0, 'on': false});

    }

  }
}

print("Starting script!!!");

Timer.set(
  interval,
  true,
  function () {
    print("Starting to fetch data from solarlog");
    Shelly.call("HTTP.POST", { url: SolarLogServer , body: SolarLogCmd , timeout: timeout_http_connections }, process_result);
  }
);
