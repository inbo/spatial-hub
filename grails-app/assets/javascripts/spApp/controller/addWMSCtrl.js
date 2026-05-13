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
                            var xml = x2js.xml_str2json(resp);

                            if (!xml || !xml.WMS_Capabilities) {
                                var errMsg = 'Unexpected response from WMS server (no WMS_Capabilities found)';
                                if (xml && xml.ServiceExceptionReport && xml.ServiceExceptionReport.ServiceException) {
                                    errMsg = String(
                                        xml.ServiceExceptionReport.ServiceException.__text ||
                                        xml.ServiceExceptionReport.ServiceException._code ||
                                        errMsg
                                    );
                                }
                                $scope.warning = errMsg;
                                return;
                            }

                            var version = xml.WMS_Capabilities.version || xml.WMS_Capabilities._version;

                            function getLegendUrl(lyr) {
                                if (!lyr || !lyr.Style) return '';
                                var styles = lyr.Style;
                                var firstStyle = Array.isArray(styles) ? styles[0] : styles;
                                if (!firstStyle || !firstStyle.LegendURL || !firstStyle.LegendURL.OnlineResource) return '';
                                var res = firstStyle.LegendURL.OnlineResource['xlink:href'] || firstStyle.LegendURL.OnlineResource.href || '';
                                if (!res) return '';
                                return $SH.baseUrl + '/portal/proxy?url=' + encodeURIComponent(res);
                            }

                            function findLayers(node) {
                                if (!node) return;
                                if (node.Layer) {
                                    var children = Array.isArray(node.Layer) ? node.Layer : [node.Layer];
                                    for (var i = 0; i < children.length; i++) {
                                        var lyr = children[i];
                                        if (lyr.Name) {
                                            var name = typeof lyr.Name === 'string' ? lyr.Name : (lyr.Name.__text || lyr.Name.toString());
                                            
                                            // Prevent duplicates
                                            var exists = false;
                                            for (var j=0; j<$scope.availableLayers.length; j++) {
                                                if ($scope.availableLayers[j].name === name) {
                                                    exists = true;
                                                    break;
                                                }
                                            }

                                            if (!exists) {
                                                var title = typeof lyr.Title === 'string' ? lyr.Title : (lyr.Title ? (lyr.Title.__text || lyr.Title.toString()) : name);
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

                            if (xml.WMS_Capabilities.Capability) {
                                findLayers(xml.WMS_Capabilities.Capability);
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
                    var len = $scope.selectedServer.lastIndexOf('?')
                    if (len < 0) len = $scope.selectedServer.length
                    var serverUrl = $scope.selectedServer.substr(0, len);
                    var proxyUrl = $SH.baseUrl + "/portal/proxy?url=" + encodeURIComponent(serverUrl);
                    var layer = Object.assign({url: proxyUrl, layertype: "wms"}, $scope.selectedLayer);

                    MapService.add(layer).then(function (data) {
                        //layer added successfully
                    }).catch(function (err) {
                        $scope.warning = err;
                    })
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