/* Escenario original conservado y migrado al esquema común. */
(function(){const m=NexoMaps.normalize({
  width: 960,
  height: 540,
  walls: [
    { x: 0, y: 0, width: 960, height: 18 },
    { x: 0, y: 540 - 18, width: 960, height: 18 },
    { x: 0, y: 0, width: 18, height: 540 },
    { x: 960 - 18, y: 0, width: 18, height: 540 },
    { x: 208, y: 88, width: 20, height: 160 },
    { x: 208, y: 326, width: 20, height: 126 },
    { x: 385, y: 18, width: 20, height: 114 },
    { x: 385, y: 210, width: 20, height: 132 },
    { x: 562, y: 88, width: 20, height: 160 },
    { x: 562, y: 326, width: 20, height: 126 },
    { x: 278, y: 266, width: 90, height: 18 },
    { x: 454, y: 266, width: 90, height: 18 },
    { x: 715, y: 168, width: 105, height: 18 }
  ],
  doors: [
    { id: 'door-west', x: 208, y: 248, width: 20, height: 78, open: false },
    { id: 'door-center', x: 385, y: 132, width: 20, height: 78, open: false },
    { id: 'door-east', x: 562, y: 248, width: 20, height: 78, open: false }
  ],
  cover: [
    { x: 96, y: 176, width: 58, height: 22 },
    { x: 284, y: 124, width: 52, height: 30 },
    { x: 292, y: 384, width: 68, height: 22 },
    { x: 466, y: 112, width: 62, height: 22 },
    { x: 466, y: 388, width: 62, height: 22 },
    { x: 642, y: 334, width: 72, height: 22 },
    { x: 812, y: 284, width: 54, height: 30 }
  ],
  exit: { x: 900, y: 270, radius: 25 }
});m.id="arena-original";m.name="00 · Arena original";m.author="NEXO original";m.spawns=[{id:"s1",x:72,y:248},{id:"s2",x:116,y:292}];m.weapons=[{id:"w1",x:96,y:270,weapon:"pistol",ammo:18}];m.enemies=[{id:"ga",x:126,y:94,type:"pistol",weapon:"pistol",angle:1.57},{id:"gb",x:318,y:190,type:"pistol",weapon:"pistol",angle:3.14},{id:"gc",x:486,y:78,type:"heavy",weapon:"rifle",angle:1.57},{id:"gd",x:664,y:236,type:"pistol",weapon:"pistol",angle:3.14},{id:"ge",x:814,y:410,type:"heavy",weapon:"rifle",angle:3.14}];m.ammo=[{x:296,y:310,amount:8},{x:690,y:100,amount:8}];NexoMaps.maps.push(NexoMaps.normalize(m));})();