var routeLayer = null;
var markerLayer = null;

var start_maker_style = new ol.style.Style({
    image: new ol.style.Icon({
        src: '/static/img/route_start.png'
    })
});
var end_maker_style = new ol.style.Style({
    image: new ol.style.Icon({
        src: '/static/img/route_end.png'
    })
});


var switchableLayers = [wmsUG01, wmsE00, wmsE01, wmsE02, wmsE03];

var route_active_style = new ol.style.Style({
    stroke: new ol.style.Stroke({
        color: 'red',
        width: 4
    })
});

var route_inactive_style = new ol.style.Style({
    stroke: new ol.style.Stroke({
        color: 'red',
        width: 2,
        lineDash: [0.1, 5],
        opacity: 0.5
    })
});


function waitForFloors(space_floor_id) {
    if (floor_layers.length > 0) {
        for (var i = 0; i < building_info.num_floors; i++) {
            if (building_info.buildingfloor_set[i].id == space_floor_id) {
                activateLayer(i);
            }
        }
    }
    else {
        setTimeout(function () {
            waitForFloors(space_floor_id);
        }, 250);
    }
}


function hideLayers() {
    for (var i = 0; i < switchableLayers.length; i++) {
        switchableLayers[i].setVisible(false);
    }
    if (floor_layers.length > 0) {
        for (var i = 0; i < floor_layers.length; i++) {
            floor_layers[i].setVisible(false);
        }
    }
    $("#floor-links li").removeClass("active");
}


function setLayerVisible(index) {
    switchableLayers[index].setVisible(true);
    if (floor_layers.length > 0) {
        floor_layers[index].setVisible(true);
        $("#floor-links li:nth-child(" + (floor_layers.length - index) + ")").addClass("active");

        // set active_floor_num
        active_floor_num = floor_layers[index].getProperties().floor_num;
        if (routeLayer) {
            var features = routeLayer.getSource().getFeatures();
            for (var i = 0; i < features.length; i++) {
                var feature_floor = features[i].getProperties().floor;
                if (feature_floor == active_floor_num) {
                    features[i].setStyle(route_active_style);
                } else {
                    features[i].setStyle(route_inactive_style);
                }
            }
        }
    }
}


function activateLayer(index) {
    hideLayers();
    setLayerVisible(index);
    update_url('map');
}


var map = new ol.Map({
    interactions: ol.interaction.defaults().extend([
        new ol.interaction.DragRotateAndZoom()
    ]),
    //layers: [backgroundLayers[0], backgroundLayers[1], wmsUG01, wmsE00, wmsE01, wmsE02, wmsE03],
    layers: [
        new ol.layer.Group({
            'title': 'Background',
            layers: [mapQuestOsm, OsmBackLayer, SatelliteLayer
            ]
        }),
        new ol.layer.Group({
            title: 'Etage',
            layers: [

                wmsUG01, wmsE00, wmsE01, wmsE02, wmsE03
            ]
        }),
    ],
    target: 'map',
    controls: ol.control.defaults({
        attributionOptions: /** @type {olx.control.AttributionOptions} */ ({
            collapsible: false
        })
    }),
    view: new ol.View({
        center: [startCenterX, startCenterY],
        zoom: zoom_level
    })
});


function addRoute(buildingId, fromNumber, toNumber, routeType) {
    var baseUrl = '/api/v1/directions/';
    var geoJsonUrl = baseUrl + 'buildingid=' + buildingId + '&startid=' + fromNumber + '&endid=' + toNumber + '/?format=json';

    var startingLevel = fromNumber.charAt(0);

    if (routeLayer) {
        map.removeLayer(routeLayer);
        console.log("removing layer now");
        //map.getLayers().pop();
    }

    var source = new ol.source.Vector();
    $.ajax(geoJsonUrl).then(function (response) {
        //console.log("response", response);
        var geojsonFormat = new ol.format.GeoJSON();
        var features = geojsonFormat.readFeatures(response,
            {featureProjection: 'EPSG:4326'});
        source.addFeatures(features);

        addMarkers(features);

        // active the floor of the start point
        var start_floor = features[0].getProperties().floor;
        for (var i = 0; i < floor_layers.length; i++) {
            if (start_floor == floor_layers[i].getProperties().floor_num) {
                activateLayer(i);
            }
        }
        // center up the route
        var extent = source.getExtent();
        map.getView().fit(extent, map.getSize());
    });

    routeLayer = new ol.layer.Vector({
        //url: geoJsonUrl,
        //format: new ol.format.GeoJSON(),
        source: source,
        style: function (feature, resolution) {
            var feature_floor = feature.getProperties().floor;
            if (feature_floor == active_floor_num) {
                feature.setStyle(route_active_style);
            } else {
                feature.setStyle(route_inactive_style);
            }
        },
        title: "Route",
        name: "Route",
        visible: true,
        zIndex: 9999
    });

    map.getLayers().push(routeLayer);

    $("#clearRoute").removeClass("hide");
    $("#shareRoute").removeClass("hide");
}

$("#clearRoute").click(function () {
    if (routeLayer) {
        map.removeLayer(routeLayer);
    }
    if (markerLayer) {
        map.removeLayer(markerLayer);
    }
    $("#clearRoute").addClass("hide");
    $("#shareRoute").addClass("hide");
    $("#route-to").val('');
    $("#route-from").val('');
});

function addMarkers(route_features){
    var marker_features = [];
    var lengthList = [];
    var floorList = [];
    var prevFloorNum = -99;
    var index = -1;
    var nFeatures = route_features.length;
    var distance = 0;

    if(markerLayer){
        map.removeLayer(markerLayer);
    }

    if(nFeatures == 0 ) return;
    // add middle icons
    for(var i = 0; i < nFeatures; i++) {
        var floor_num = route_features[i].getProperties().floor;
        if (prevFloorNum != floor_num) {
            floorList.push(floor_num);
            index++;
            prevFloorNum = floor_num;
            if (!lengthList[index]) lengthList[index] = 0;
        }
        lengthList[index] += route_features[i].getGeometry().getLength();
    }

    index = 0;
    for(i = 0; i < nFeatures; i++){
        var floor_num = route_features[i].getProperties().floor;

        if(floorList[index]==floor_num)
            distance += route_features[i].getGeometry().getLength();
        if(floorList[index]==floor_num && lengthList[index]/2 < distance){
            var line_extent = route_features[i].getGeometry().getExtent();
            var middleCoordinate = ol.extent.getCenter(line_extent);
            var middlePoint = new ol.geom.Point(route_features[i].getGeometry().getClosestPoint(middleCoordinate));

            var middleFeature = new ol.Feature({
                geometry: middlePoint
            });
            var floor_num_style = new ol.style.Style({
                image: new ol.style.Icon({
                    src: '/static/img/route_floor_' + floor_num + '.png'
                })
            });
            middleFeature.setStyle(floor_num_style);
            marker_features.push(middleFeature);

            index ++;
            distance = 0;
        }

    }

    console.log(floorList);
    console.log(lengthList);

    // Add start/end marker
    var start_point = new ol.geom.Point(route_features[0].getGeometry().getLastCoordinate());
    var end_point = new ol.geom.Point(route_features[route_features.length-1].getGeometry().getLastCoordinate());
    var startMarker = new ol.Feature({
        geometry: start_point
    });
    var endMarker = new ol.Feature({
        geometry: end_point
    });
    endMarker.setGeometry(end_point);
    startMarker.setStyle(start_maker_style);
    endMarker.setStyle(end_maker_style);

    marker_features.push(startMarker);
    marker_features.push(endMarker);

    markerLayer = new ol.layer.Vector({
        source: new ol.source.Vector({
          features: marker_features
        }),
        title: "icon_layer",
        name: "icon_layer",
        visible: true,
        zIndex: 9999
    });
    map.getLayers().push(markerLayer);
}