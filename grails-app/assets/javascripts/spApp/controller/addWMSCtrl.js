(function (angular) {
    'use strict';
    /**
     * @memberof spApp
     * @ngdoc controller
     * @name AddWMSCtrl
     * @description
     *   Add an WMS to the map
     */
    angular.module('add-w-m-s-ctrl', ['map-service', 'layers-service', 'predefined-areas-service'])
        .controller('AddWMSCtrl', ['LayoutService', '$scope', '$http', 'MapService',
            function (LayoutService, $scope, $http, MapService) {
                $scope._httpDescription = function (method, httpconfig) {
                    if (httpconfig === undefined) {
                        httpconfig = {};
                    }
                    httpconfig.service = 'AddWMSCtrl';
                    httpconfig.method = method;

                    return httpconfig;
                };


                $scope.loading = false;
                $scope.warning = '';

                $scope.selectedLayerLabel = '';
                $scope.isAutomatic = true;
                $scope.version = "";
                $scope.availableLayers = [];
                $scope.selectedServer = "";
                $scope.moreInfo = false;

                $scope.presetServers = $SH.presetWMSServers;

                $scope.getMapExamples = $SH.getMapExamples;

                $scope.getCapabilities = function () {
                    var sep = $scope.selectedServer.indexOf('?') >= 0 ? '&' : '?';
                    var url = $scope.selectedServer + sep + 'service=WMS&request=GetCapabilities' + ($scope.version ? "&version=" + $scope.version : "");
                    $scope.warning = '';
                    $scope.loading = true;

                    var urlFinal = $SH.baseUrl + "/portal/proxy?url=" + encodeURIComponent(url)

                    $http.get(urlFinal, $scope._httpDescription('proxyGetCapabilities'))
                        .success(function (resp) {
                            $scope.availableLayers = [];
                            var x2js = new X2JS({attributePrefix: []});
                            var cleanXmlStr = resp;
                            if (typeof resp === 'string') {
                                var startIdx = resp.indexOf('<');
                                if (startIdx > -1) {
                                    cleanXmlStr = resp.substring(startIdx).trim();
                                } else {
                                    cleanXmlStr = resp.trim();
                                }
                            }
                            var xmlRaw = x2js.xml_str2json(cleanXmlStr);

                            function stripNamespaces(obj) {
                                if (obj === null || typeof obj !== 'object') {
                                    return obj;
                                }
                                if (Array.isArray(obj)) {
                                    return obj.map(stripNamespaces);
                                }
                                var cleaned = {};
                                for (var key in obj) {
                                    if (obj.hasOwnProperty(key)) {
                                        var newKey = key;
                                        var colonIdx = key.indexOf(':');
                                        if (colonIdx > -1) {
                                            newKey = key.substring(colonIdx + 1);
                                        }
                                        cleaned[newKey] = stripNamespaces(obj[key]);
                                    }
                                }
                                return cleaned;
                            }

                            var xml = stripNamespaces(xmlRaw);

                            var capabilitiesKey = Object.keys(xml || {}).find(function (key) {
                                var k = key.toLowerCase();
                                return k === 'wms_capabilities' || k === 'wmt_ms_capabilities';
                            });
                            var capabilities = capabilitiesKey ? xml[capabilitiesKey] : null;

                            if (!capabilities) {
                                var errMsg = 'Unexpected response from WMS server (no WMS_Capabilities found)';
                                var exceptionKey = Object.keys(xml || {}).find(function (key) {
                                    return key.toLowerCase() === 'serviceexceptionreport';
                                });
                                var exceptionReport = exceptionKey ? xml[exceptionKey] : null;
                                if (exceptionReport && exceptionReport.ServiceException) {
                                    errMsg = String(
                                        exceptionReport.ServiceException.__text ||
                                        exceptionReport.ServiceException._code ||
                                        errMsg
                                    );
                                }
                                $scope.warning = errMsg;
                                return;
                            }

                            var version = capabilities.version || capabilities._version || capabilities.Version || capabilities._Version || "";

                            function safeDecode(str) {
                                try {
                                    return decodeURIComponent(str);
                                } catch (e) {
                                    return str;
                                }
                            }

                            function getLegendUrl(lyr) {
                                if (!lyr) return '';
                                var styleKey = Object.keys(lyr).find(function (k) { return k.toLowerCase() === 'style'; });
                                if (!styleKey) return '';
                                var styles = lyr[styleKey];
                                var firstStyle = Array.isArray(styles) ? styles[0] : styles;
                                if (!firstStyle) return '';

                                var legendUrlKey = Object.keys(firstStyle).find(function (k) { return k.toLowerCase() === 'legendurl'; });
                                if (!legendUrlKey) return '';
                                var legendUrl = firstStyle[legendUrlKey];

                                var onlineResourceKey = Object.keys(legendUrl).find(function (k) { return k.toLowerCase() === 'onlineresource'; });
                                if (!onlineResourceKey) return '';
                                var onlineResource = legendUrl[onlineResourceKey];

                                var res = onlineResource['xlink:href'] || onlineResource.href || onlineResource['href'] || '';
                                if (!res) return '';
                                res = safeDecode(res).replace(':4443/', '/');
                                return $SH.baseUrl + '/portal/proxy?url=' + encodeURIComponent(res);
                            }

                            function findLayers(node) {
                                if (!node) return;

                                var layerKey = Object.keys(node).find(function (k) { return k.toLowerCase() === 'layer'; });
                                if (layerKey) {
                                    var children = Array.isArray(node[layerKey]) ? node[layerKey] : [node[layerKey]];
                                    for (var i = 0; i < children.length; i++) {
                                        var lyr = children[i];

                                        var nameKey = Object.keys(lyr).find(function (k) { return k.toLowerCase() === 'name'; });
                                        if (nameKey) {
                                            var nameVal = lyr[nameKey];
                                            var name = typeof nameVal === 'string' ? nameVal : (nameVal.__text || nameVal.toString());

                                            // Prevent duplicates
                                            var exists = false;
                                            for (var j = 0; j < $scope.availableLayers.length; j++) {
                                                if ($scope.availableLayers[j].name === name) {
                                                    exists = true;
                                                    break;
                                                }
                                            }

                                            if (!exists) {
                                                var titleKey = Object.keys(lyr).find(function (k) { return k.toLowerCase() === 'title'; });
                                                var title = name;
                                                if (titleKey) {
                                                    var titleVal = lyr[titleKey];
                                                    title = typeof titleVal === 'string' ? titleVal : (titleVal ? (titleVal.__text || titleVal.toString()) : name);
                                                }

                                                $scope.availableLayers.push({
                                                    displayname: title,
                                                    name: name,
                                                    title: title,
                                                    version: version,
                                                    legendurl: getLegendUrl(lyr)
                                                });
                                            }
                                        }
                                        findLayers(lyr); // Recurse
                                    }
                                }
                            }

                            var capabilityKey = Object.keys(capabilities).find(function (key) {
                                return key.toLowerCase() === 'capability';
                            });
                            var capability = capabilityKey ? capabilities[capabilityKey] : null;

                            if (capability) {
                                findLayers(capability);
                            }
                        })
                        .error(function (resp) {
                            if (resp.error) {
                                $scope.warning = resp.error;
                                $scope.warning += '[' + url + ' may not in proxy list!]'
                            } else
                                $scope.warning = resp;

                        })
                        .finally(function () {
                            $scope.loading = false;
                        });

                };


                            $scope.addLayer = function () {
                // Remove any query string from the server URL
                var baseUrl = $scope.selectedServer;
                var qPos = baseUrl.indexOf('?');
                if (qPos >= 0) baseUrl = baseUrl.substring(0, qPos);

                // Build a proper WMS GetMap request (EPSG:3857 is a safe default)
                var getMapUrl = baseUrl +
                    (baseUrl.indexOf('?') >= 0 ? '&' : '?') +
                    'service=WMS&request=GetMap' +
                    '&layers=' + encodeURIComponent($scope.selectedLayer.name) +
                    '&crs=EPSG:3857' +
                    '&format=image%2Fpng' +
                    '&transparent=true';

                // Proxy the final URL
                var proxyUrl = $SH.baseUrl + '/portal/proxy?url=' + encodeURIComponent(getMapUrl);

                // Create the layer object expected by MapService
                var layer = {
                    url: proxyUrl,
                    layertype: 'wms',
                    name: $scope.selectedLayer.name,
                    title: $scope.selectedLayer.title,
                    version: $scope.selectedLayer.version,
                    legendurl: $scope.selectedLayer.legendurl
                };

                MapService.add(layer).then(function () {
                    $scope.$close();
                }).catch(function (err) {
                    $scope.warning = err;
                });
            };
                };

                $scope.addLayerFromGetMapRequest = function () {
                    //parsing
                    if (!validateURL($scope.selectedGetMapExample)) {
                        $scope.warning = $i18n(406, "Invalid URL") + ": " + url;
                        return;
                    }

                    var result = {};
                    var sepIndex = $scope.selectedGetMapExample.indexOf('?');

                    result['URL'] = $scope.selectedGetMapExample.substr(0, sepIndex);

                    var queryString = $scope.selectedGetMapExample.substr(sepIndex + 1, $scope.selectedGetMapExample.length - sepIndex);
                    queryString.split("&").forEach(function (part) {
                        if (!part) return;
                        part = part.split("+").join(" "); // replace every + with space, regexp-free version
                        var eq = part.indexOf("=");
                        var key = eq > -1 ? part.substr(0, eq) : part;
                        var val = eq > -1 ? decodeURIComponent(part.substr(eq + 1)) : "";
                        var from = key.indexOf("[");
                        if (from === -1) result[decodeURIComponent(key)] = val;
                        else {
                            var to = key.indexOf("]", from);
                            var index = decodeURIComponent(key.substring(from + 1, to));
                            key = decodeURIComponent(key.substring(0, from));
                            if (!result[key]) result[key] = [];
                            if (!index) result[key].push(val);
                            else result[key][index] = val;
                        }
                    });

                    if (!result.LAYERS || /^\s*$/.test(result.LAYERS)) {
                        $scope.warning = $i18n(407, "No layer selected");
                        return;
                    }
                    if (result.REQUEST.toUpperCase() !== "GETMAP") {
                        $scope.warning = $i18n(408, "URL must be a valid 'GetMap' request");
                        return;
                    }

                    var layer = {
                        url: $SH.baseUrl + "/portal/proxy?url=" + encodeURIComponent(result.URL),
                        type: 'wms',
                        layertype: 'wms',
                        version: result.VERSION,
                        name: result.LAYERS,
                        // legend url here is not valid for all
                        legendurl: $SH.baseUrl + "/portal/proxy?url=" + encodeURIComponent($scope.selectedGetMapExample.replace("GetMap", "GetLegendGraphic").replace("LAYERS=", "LAYER="))
                    };

                    MapService.add(layer).then(function (data) {
                        $scope.$close();
                    }).catch(function (err) {
                        $scope.warning = err;
                    })
                };

                var validateURL = function (str) {
                    var pattern = new RegExp('((([A-Za-z]{3,9}:(?:\\/\\/)?)(?:[-;:&=\\+\\$,\\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\\+\\$,\\w]+@)[A-Za-z0-9.-]+)((?:\\/[\\+~%\\/.\\w-_]*)?\\??(?:[-\\+=&;%@.\\w_]*)#?(?:[\\w]*))?)'); // fragment locater
                    return pattern.test(str)
                };

                $scope.addToMapEnabled = function () {
                    return !(($scope.selectedLayer !== undefined && $scope.selectedServer !== '' && $scope.isAutomatic) ||
                        ($scope.selectedGetMapExample !== undefined && !$scope.isAutomatic))
                };

                $scope.addToMap = function () {
                    if ($scope.isAutomatic) {
                        $scope.addLayer()
                    } else {
                        $scope.addLayerFromGetMapRequest()
                    }
                }
            }])
}(angular));