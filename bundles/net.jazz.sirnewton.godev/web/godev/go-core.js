// Copyright 2013 Chris McGee <sirnewton_01@yahoo.ca>. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.
define(['orion/xhr', 'orion/plugin', 'orion/form'], function (xhr, PluginProvider, form) {
    var headers = {
        name: "Go Language Core Plugin",
        version: "1.0",
        description: "Go programming language core services."
    };
    
    var provider = new PluginProvider(headers);
    
    provider.registerServiceProvider("orion.page.link", {}, {
        name: "Go Doc",
        id: "godev.godoc",
        uriTemplate: "{+OrionHome}/godoc/pkg/"
        });

//    provider.registerServiceProvider("orion.navigate.command", {}, {
//        name: "Open Go Doc",
//        id: "godev.godoc.lookup",
//        forceSingleItem: true,
//        uriTemplate: "{+OrionHome}/godev/godoc/godoc.html#location={+Location}",
//        tooltip: "Open up the go doc for this package"
//    });
        
    provider.registerServiceProvider("orion.page.link", {}, {
        name: "Debug",
        id: "godev.debug",
        uriTemplate: "{+OrionHome}/godev/debug/debug.html"
        });

    provider.registerServiceProvider("orion.edit.validator", {
            checkSyntax: function (title, contents) {
                // title is a relative URI for the file
                var pkg = title;
                pkg = pkg.replace(/^\/file\//g, "");
                var pkgSegs = pkg.split('/');
			    pkg = pkgSegs.splice(0,pkgSegs.length-1).join('/');
                
	            var d = xhr("GET", "/go/build?pkg=" + pkg + "&clean=true", {
	                    headers: {},
	                    timeout: 60000
	                }).then(function (result) {
	                    var errors = JSON.parse(result.response);
	                    var problems = [];
	                    
	                    for (var idx = 0; idx < errors.length; idx++) {
	                        var error = errors[idx];
	                        
	                        if (error.Location === title) {
			                    problems.push({
			                        description: error.Msg,
			                        line: error.Line,
			                        start: error.Column,
			                        end: 80,
			                        severity: "error"
			                    });
			                // There is another problem unrelated to this file
			                //  Put a marker at the top of the file.
		                    } else {
		                        problems.push({
		                            description: "There is a compile error in another file: "+error.Location,
		                            line: 1,
		                            start: 0,
		                            end: 80,
		                            severity: "error"
		                        });
		                    }
	                    }
	                    return {problems: problems};
	                });
	
	            return d;
            }
        }, {
            contentType: ["text/x-go"]
        });

    provider.registerServiceProvider("orion.edit.validator", {
            checkSyntax: function (title, contents) {
                var problems = [];
                var lines = contents.split(/\r?\n/);
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];

                    var todoMatch = /\/\/\s*TODO/.exec(line);
                    if (todoMatch) {
                        problems.push({
                                description: "TODO",
                                line: i + 1,
                                start: todoMatch.index + 1,
                                end: todoMatch.index + todoMatch[0].length + 1,
                                severity: "task"
                            });
                    }

                    var fixmeMatch = /\/\/\s*FIXME/.exec(line);
                    if (fixmeMatch) {
                        problems.push({
                                description: "FIXME",
                                line: i + 1,
                                start: fixmeMatch.index + 1,
                                end: fixmeMatch.index + fixmeMatch[0].length + 1,
                                severity: "warning"
                            });
                    }
                }
                var result = {
                    problems: problems
                };
                return result;
            }
        }, {
            contentType: ["text/x-go"]
        });
        
    provider.registerServiceProvider("orion.edit.contentAssist", {
            computeProposals: function (buffer, offset, context) {
                // TODO provide the path for the editor buffer for better results
                var d = xhr("POST", "/completion?offset=" + offset + 
                                               "&path=" + context.title, {
	                    headers: {},
	                    timeout: 60000,
	                    data: buffer
	                }).then(function (result) {
	                    var completions = JSON.parse(result.response);
	                    var proposals = [];
	                    
	                    var name, type, proposal, positions;
	                    
	                    if (completions.length < 2) {
	                        return proposals;
	                    }
	                    
	                    for (var idx = 0; idx < completions[1].length; idx++) {
	                        name = completions[1][idx].name;
	                        type = completions[1][idx].type;
	                        
	                        // The proposal is just the name for now
	                        proposal = name;
	                        
	                        // Positions are only necessary for functions
	                        positions = null;
		                    
		                    // This is a function, 
		                    if (type.indexOf("func") === 0) {
		                        var signature = type.substring(type.indexOf("(")+1, type.indexOf(")"));
		                        var parameters = signature.split(",");
		          
		                        if (parameters.length !== 1 || parameters[0] !== "") {
			                        var parameterOffset = 0;         
			                        positions = [];
			                        for (var j = 0; j < parameters.length; j++) {
			                            positions.push({offset: offset + proposal.length + 1 + parameterOffset - context.prefix.length, length: parameters[j].length});
			                            parameterOffset = parameterOffset + parameters[j].length + 1;
			                        }
		                        }
		                        
		                        proposal = proposal + "(" + signature + ")";
		                    }
		                    
		                    proposals.push({
	                            proposal: proposal,
	                            description: name + " " + type,
	                            positions: positions,
	                            escapePosition: offset + proposal.length - context.prefix.length,
	                            overwrite: true
	                        });
                        }

	                    return proposals;
	                }, function(error) {
	                    if (error.status === 400) {
		                    return [{proposal: "", 
		                                description: "go get github.com/nsf/gocode for more assistance",
		                                escapePosition: offset}];
	                    }
	                    
	                    return [];
	                });
	
	            return d;
            }
        }, {
            name: "Go content assist",
            contentType: ["text/x-go"]
        });


    provider.registerServiceProvider("orion.edit.contentAssist", {
            computeProposals: function (buffer, offset, context) {
                var NL = context.delimiter;
                var INDENT = context.indentation;
                var TAB = context.tab;
                
                var constructs = [
                    "inner", "if", "if",            "if ${cond} {"                         +NL+
                        INDENT+                      TAB+"${cursor}"                       +NL+
                        INDENT+                     "}",
                        
                    "outer", "func", "func",        "func ${name}() (${retval} ${type}) {"  +NL+
                        INDENT+                      TAB+"${cursor}"                       +NL+
                        INDENT+                     "}",
                        
                    "inner", "for", "for",          "for ${cond} {"                        +NL+
                        INDENT+                      TAB+"${cursor}"                       +NL+
                        INDENT+                      "}",
                        
                    "inner", "switch", "switch",    "switch {"                             +NL+
                        INDENT+                     "case ${cond}:"                        +NL+
                        INDENT+                      TAB+"${cursor}"                       +NL+
                        INDENT+                     "default:"                             +NL+
                        INDENT+                     "}",
                        
                    "inner", "select", "select",    "select {"                             +NL+
                        INDENT+                     "case ${cond}:"                        +NL+
                        INDENT+                      TAB+"${cursor}"                       +NL+
                        INDENT+                     "default:"                             +NL+
                        INDENT+                     "}",
                                          
                    "outer", "var", "var",          "var ("                                +NL+
                        INDENT+                      TAB+"${cursor}"                       +NL+
                        INDENT+                     "}",
                                     
                    "outer", "const", "const",      "const ("                              +NL+
                        INDENT+                      TAB+"${cursor}"                       +NL+
                        INDENT+                     "}",
                                         
                    "outer", "import", "import",    "import ("                             +NL+
                        INDENT+                      TAB+"${cursor}"                       +NL+
                        INDENT+                     "}",

                    "outer", "", "method",          "func (this *${type}) ${name}() (${retval} ${type}) {"+NL+
                        INDENT+                      TAB+"${cursor}"                       +NL+
                        INDENT+                     "}",
                        
                    "outer", "", "struct",          "type ${name} struct {"                +NL+
                        INDENT+                      TAB+"${cursor}"                       +NL+
                        INDENT+                     "}",
                        
                    "outer", "", "interface",       "type ${name} interface {"             +NL+
                        INDENT+                      TAB+"${cursor}"                       +NL+
                        INDENT+                     "}",
                        
                    "inner", "", "make channel",    "ch := make(chan ${type}, 0)",
                    
                    "inner", "", "make array",      "arr := make([]${type}, 1, 1)",
                    
                    "outer", "", "main",            "func main() {"                        +NL+
                        INDENT+                      TAB+"${cursor}"                       +NL+
                        INDENT+                     "}"
                                                     
                ];

                var proposals = [];

                if (buffer.length === 0 && offset === 0) {
                    proposals.push({
                            description: "new file template",
                            proposal: "// COPYRIGHT"          +NL+
                                      ""                      +NL+
                                      "// GODOC"              +NL+
                                      "package ${name}"       +NL+
                                      NL+
                                      "import ("              +NL+
                                       TAB+"${import}"        +NL+
                                      ")"                     +NL+
                                      NL+
                                      "func main() {"         +NL+
                                       TAB                    +NL+
                                      "}"                     +NL,
                            escapePosition: 78,
                            positions: [{offset:31+offset, length: 7},
                                        {offset: 50+offset, length: 9}]
                        });
                        
                    proposals.push({
                            description: "new test template",
                            proposal: "// COPYRIGHT"          +NL+
                                      ""                      +NL+
                                      "package main"       +NL+
                                      NL+
                                      "import ("              +NL+
                                       TAB+"testing"        +NL+
                                      ")"                     +NL+
                                      NL+
                                      "func Test1(t *testing.T) {"         +NL+
                                       TAB                    +NL+
                                      "}"                     +NL,
                            escapePosition: 77,
                            positions: []
                        });
                }

                for (var i = 0; i < constructs.length; i = i + 4) {
                    var type = constructs[i];
                    var matcher = constructs[i + 1];
                    var keyword = constructs[i + 2];
                    var proposal = constructs[i + 3];
                    
                    if (matcher.indexOf(context.prefix) !== 0) {
                        continue;
                    }

                    // Check whether this proposal is an "outer" (outside of a var, const, func block)
                    //   or an "inner"
                    if (type === "inner" && INDENT === "") {
                        continue;
                    }
                    if (type === "outer" && INDENT !== "") {
                        continue;
                    }

                    // Ellide the proposal with the existing prefix text where possible
                    if (proposal.indexOf(context.prefix) === 0) {
                        proposal = proposal.substring(context.prefix.length);
                    }
                    
                    var propObj = {description: keyword,
                                     positions: []};
                    
                    // Calculate positions for the variables and the cursor
                    var cursorIdx = proposal.indexOf("${cursor}");
                    if (cursorIdx !== -1) {
                        propObj.escapePosition = cursorIdx + offset;
                        proposal = proposal.replace("${cursor}", "");
                    }
                    
                    propObj.proposal = proposal;
                    
                    var idx = 0;
                    while (idx !== -1 && idx < proposal.length - 4) {
                        idx = proposal.indexOf("${", idx+1);
                        
                        if (idx !== -1) {
                            var off = idx + offset;
                            var len = proposal.indexOf("}", idx+1) + 1 - idx;
                            if (len > 0) {
                                propObj.positions.push({offset: off, length: len});
                            }
                        }
                    }

                    proposals.push(propObj);
                }

                return proposals;
            }
        }, {
            name: "Go content assist",
            contentType: ["text/x-go"]
        });

    provider.registerServiceProvider("orion.edit.outliner", {
            getOutline: function (contents, title) {
                var outline = [];
                var lines = contents.split(/\r?\n/);
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    // Check for any functions on this line
                    // TODO handle functions that cross lines even though this wouldn't follow style guidelines
                    // TODO include the parameters, member type
                    var funcMatch = /^func\s+([a-zA-Z0-9]+).*$/.exec(line);

                    if (funcMatch) {
                        outline.push({
                                label: "func " + funcMatch[1],
                                line: i + 1
                            });
                    }

                    var methodMatch = /^func\s+\(([^)]+)\)\s+([a-zA-Z0-9]+).*$/.exec(line);

                    if (methodMatch) {
                        outline.push({
                                label: "func " + methodMatch[1],
                                line: i + 1
                            });
                    }

                    // TODO handle type blocks and types whose names span multiple lines
                    var typeMatch = /^type\s+([a-zA-Z0-9]+).*$/.exec(line);
                    if (typeMatch) {
                        outline.push({
                                label: "type " + typeMatch[1],
                                line: i + 1
                            });
                    }

                    var varMatch = /var \(/.exec(line);
                    if (varMatch) {
                        outline.push({
                                label: "VAR",
                                line: i + 1
                            });
                    }

                    var constMatch = /const \(/.exec(line);
                    if (constMatch) {
                        outline.push({
                                label: "CONST",
                                line: i + 1
                            });
                    }

                    var importMatch = /import \(/.exec(line);
                    if (importMatch) {
                        outline.push({
                                label: "IMPORT",
                                line: i + 1
                            });
                    }
                }
                return outline;
            }
        }, {
            contentType: ["text/x-go"],
            name: "Go Outline",
            id: "net.jazz.sirnewton.go.outline"
        });

    // Register shell commands the go tool (e.g. go fmt, go build)
    provider.registerServiceProvider(
        "orion.shell.command",
        null, {
            name: "go",
            description: "go tool commands"
        });

    // Go Format shell command
    var formatCmdImpl = {
        callback: function (args, cwd) {
            var pkg = args.pkg;
            if (!pkg) {
                pkg = cwd.cwd;
                pkg = pkg.replace(/^\/file\//g, "");
            }

            var d = xhr("GET", "/go/fmt?pkg=" + pkg, {
                    headers: {},
                    timeout: 60000
                }).then(function (result) {
                    return "Finished formatting package " + pkg;
                }, function (error) {
                    return "Error formatting package " + pkg;
                });

            return d;
        }
    };

    provider.registerServiceProvider(
        "orion.shell.command",
        formatCmdImpl, {
            name: "go fmt",
            description: "Format a go package",
            parameters: [{
                    name: "pkg",
                    type: "string",
                    description: "The package to format",
                    defaultValue: null
                }
            ]
        });

    // Go Build shell command
    var buildCmdImpl = {
        callback: function (args, cwd) {
            var pkg = null;
            if (args.pkg) {
                pkg = args.pkg.path;
            } else {
                pkg = cwd.cwd;
            }
            
            pkg = pkg.replace(/^\/file\//g, "");

            var d = xhr("GET", "/go/build?pkg=" + pkg + "&clean=true", {
                    headers: {},
                    timeout: 60000
                }).then(function (result) {
                    var errors = JSON.parse(result.response);
                    if (errors.length > 0) {
                        var output = "The following errors occurred building package " + pkg + "\r\n";
                        for (var idx = 0; idx < errors.length; idx++) {
                            output = output + errors[idx].Location + ":" + errors[idx].Line + ":" + errors[idx].Msg + "\r\n";
                        }
                        return output;
                    } else {
                        return "No errors building package " + pkg;
                    }
                }, function (error) {
                    return "Error building package " + pkg;
                });

            return d;
        }
    };

    provider.registerServiceProvider(
        "orion.shell.command",
        buildCmdImpl, {
            name: "go build",
            description: "Build a go package",
            parameters: [{
                    name: "pkg",
                    type: {name: "file", directory: true, exist: true},
                    description: "The package to build",
                    defaultValue: null
                }
            ]
        });
        
    // Go Install shell command
    var installCmdImpl = {
        callback: function (args, cwd) {
            var pkg = null;
            if (args.pkg) {
                pkg = args.pkg.path;
            } else {
                pkg = cwd.cwd;
            }
            
            pkg = pkg.replace(/^\/file\//g, "");

            var d = xhr("GET", "/go/build?pkg=" + pkg + "&clean=true&install=true", {
                    headers: {},
                    timeout: 60000
                }).then(function (result) {
                    var errors = JSON.parse(result.response);
                    if (errors.length > 0) {
                        var output = "The following errors occurred installing package " + pkg + "\r\n";
                        for (var idx = 0; idx < errors.length; idx++) {
                            output = output + errors[idx].Location + ":" + errors[idx].Line + ":" + errors[idx].Msg + "\r\n";
                        }
                        return output;
                    } else {
                        return "No errors installing package " + pkg;
                    }
                }, function (error) {
                    return "Error building package " + pkg;
                });

            return d;
        }
    };

    provider.registerServiceProvider(
        "orion.shell.command",
        installCmdImpl, {
            name: "go install",
            description: "Install a go package",
            parameters: [{
                    name: "pkg",
                    type: {name: "file", directory: true, exist: true},
                    description: "The package to install",
                    defaultValue: null
                }
            ]
        });
        
	provider.registerService(
		"orion.edit.command", 
		{
			run: function(selectedText, text, selection) {
				var textToFormat = selectedText;
				
				if (!textToFormat || textToFormat === "") {
					textToFormat = text;
				}
				
				var d = xhr("POST", "/go/fmt/",
					{
						headers: {},
						timeout: 15000,
						data: textToFormat
					}).then(function(result) {
						if (selectedText && selectedText !== "") {
							return result.response;
						} else {
							return {
								text: result.response,
								selection: selection
							};
						}
					});
				
				return d;
			}
		},
		{
			name: "Format",
			tooltip: "Format Go code (Ctrl-Shift-R)",
			key: ["R", true, true],
			contentType: ["text/x-go"]
		});
		
		provider.registerService(
		"orion.edit.command", 
		{
			run: function(selectedText, text, selection) {				
				var d = xhr("POST", "/go/imports/",
					{
						headers: {},
						timeout: 15000,
						data: text
					}).then(function(result) {
						if (result.status === 200) {
							return {
								text: result.response,
								selection: selection
							};
						}
						
						return {selection: selection};
					}, function(error) {
						window.alert("Error launching the import tool. Try installing it with 'go get github.com/bradfitz/goimports'");
					});
				
				return d;
			}
		},
		{
			name: "Fix Imports",
			tooltip: "Fix Imports (Ctrl-I)",
			key: ["I", true],
			contentType: ["text/x-go"]
		});
		
		provider.registerService(
		"orion.edit.command", 
		{
			run: function(selectedText, text, selection, resource) {
				// Convert the selection offset from characters to bytes
				var byteOffset = 0;
				var charCode = 0;
				for (var i = 0; i < selection.start; i++) {
					charCode = text.charCodeAt(i);
					
					// Double byte character
					if (charCode > 0x7F) {
						byteOffset = byteOffset + 2;
					} else {
						byteOffset++;
					}
				}
				
				var d = xhr("POST", "/go/defs"+resource+"?o="+byteOffset,
					{
						headers: {},
						timeout: 15000,
						data: text
					}).then(function(result) {
						if (result.status === 200) {
							var value = JSON.parse(result.response);
							var columns = [];
							
							// Windows path
							if ((value[0] === "C" || value[0] === "c") && value[1] === ":") {
								columns = value.substring(2).split(":");
								columns[0] = value[0] + ":" + columns[0];
							} else {
								columns = value.split(":");
							}
							
							if (columns.length === 1) {
								// Package reference
								return {
									navigateUrl: "/redirect?path=" + columns[0]
								};
							} else if (columns.length === 2) {
								// Check if the first parameter is a number
								if (columns[0].match(/^[0-9]+$/)) {
									var lineNum = parseInt(columns[0]);
									var lines = text.split("\n");
									var offset = 0;
									
									for (var idx = 0; idx < lineNum-1; idx++) {
										offset = offset + lines[idx].length + 1;
									}
									
									offset = offset + parseInt(columns[1]) - 1;
									
									return {
										selection: {
											start: offset,
											end: offset
										}
									};
								} else {
									// File and line reference
									return {
										navigateUrl: "/redirect?path=" + columns[0]+"&line="+columns[1]
									};
								}
							}
						}
						
						return {selection: selection};
					}, function(error) {
						window.alert("Error launching the godef tool. Try installing it with 'go get code.google.com/p/rog-go/exp/cmd/godef'");
					});
				
				return d;
			}
		},
		{
			name: "Open Declaration",
			tooltip: "Open declaration of the selected text (F3)",
			key: [114],
			contentType: ["text/x-go"]
		});
   
	/*provider.registerService(
		"orion.edit.command", 
		{
			run: function(selectedText, text) {
				var data = {};
				
				data[text] = "";
				
				var d = xhr("POST", "http://play.golang.org/share",
					{
						headers: {
							"Content-Type": "application/x-www-form-urlencoded"
						},
						timeout: 15000,
						data: form.encodeFormData(data)
					}).then(function(result) {
						debugger;
					});
					
				debugger;
				
				// Just give back the original text
				return selectedText;
			}
		},
		{
			name: "Share with Playground"
		});*/
        
        /* provider.registerService("orion.navigate.command", {
		run : function(item) {
			var pkg = item.Location;
			pkg = pkg.replace(/^\/file\//g, "");
			var pkgSegs = pkg.split('/');
			pkg = pkgSegs.splice(0,pkgSegs.length-1).join('/');
			var d = xhr("GET", "/go/build?pkg="+pkg+"&clean=true", {
				headers: {},
				timeout: 60000
			}).then(function(result) {
				result = result.response ? JSON.parse(result.response) : null;
				if (result.length > 0) {
					window.alert("Build produced errors. Package "+pkg);
				} else {
					window.alert("Build succeeded! Package "+pkg);
				}
			});
			
			return d;
		}
	}, {
		image: "../images/gear.png",
		name: "Go Build",
		forceSingleItem: true,
		validationProperties: [
			{source: "Directory", match: false}
		],
		contentType: ["text/x-go"],
		id: "net.jazz.sirnewton.godev.build",
		tooltip: "Builds the current Go package",
		showGlobally: true
	});
	
	provider.registerService("orion.navigate.command", {
		run : function(item) {
			var pkg = item.Location;
			pkg = pkg.replace(/^\/file\//g, "");
			var pkgSegs = pkg.split('/');
			pkg = pkgSegs.splice(0,pkgSegs.length-1).join('/');
			
			var d = xhr("GET", "/go/fmt?pkg="+pkg, {
				headers: {},
				timeout: 60000
			}).then(function(result) {
				window.alert("Finished formatting package "+pkg);
			});
			
			return d;
		}
	}, {
		image: "../images/gear.png",
		name: "Go Format",
		forceSingleItem: true,
		validationProperties: [
			{source: "Directory", match: false}
		],
		contentType: ["text/x-go"],
		id: "net.jazz.sirnewton.godev.fmt",
		tooltip: "Formats the current Go package using the 'go fmt' tool.",
		showGlobally: true
	});*/

    // The following section registers a selection listener on the editor model
    /*provider.registerServiceProvider("orion.edit.model", {
            onSelection: function (e) {
                var oldSelection = e.oldValue;
                var newSelection = e.newValue;

                debugger;
            }
        }, {
            types: ["Selection"],
            contentType: ["text/x-go"]
        });
    */

    provider.connect();
});