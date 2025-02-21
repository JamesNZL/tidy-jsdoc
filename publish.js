'use strict';

const doop = require('jsdoc/util/doop');
const env = require('jsdoc/env');
const fs = require('jsdoc/fs');
const helper = require('jsdoc/util/templateHelper');
const logger = require('jsdoc/util/logger');
const path = require('jsdoc/path');
const taffy = require('taffydb').taffy;
const template = require('jsdoc/template');
const util = require('util');

const htmlsafe = helper.htmlsafe;
const linkto = helper.linkto;
const resolveAuthorLinks = helper.resolveAuthorLinks;
const scopeToPunc = helper.scopeToPunc;
const hasOwnProp = Object.prototype.hasOwnProperty;

let data;
let view;

let outdir = path.normalize(env.opts.destination);

function find(spec) {
	return helper.find(data, spec);
}

function tutoriallink(tutorial) {
	return helper.toTutorial(tutorial, null, { tag: 'em', classname: 'disabled', prefix: 'Tutorial: ' });
}

function getAncestorLinks(doclet) {
	return helper.getAncestorLinks(data, doclet);
}

function hashToLink(doclet, hash) {
	if (!/^(#.+)/.test(hash)) { return hash; }

	let url = helper.createLink(doclet);

	url = url.replace(/(#.+|$)/, hash);
	return '<a href="' + url + '">' + hash + '</a>';
}

function needsSignature(doclet) {
	let needsSig = false;

	// function and class definitions always get a signature
	if (doclet.kind === 'function' || doclet.kind === 'class') {
		needsSig = true;
	}
	// typedefs that contain functions get a signature, too
	else if (doclet.kind === 'typedef' && doclet.type && doclet.type.names &&
        doclet.type.names.length) {
		for (let i = 0, l = doclet.type.names.length; i < l; i++) {
			if (doclet.type.names[i].toLowerCase() === 'function') {
				needsSig = true;
				break;
			}
		}
	}

	return needsSig;
}

function getSignatureAttributes(item) {
	const attributes = [];

	if (item.optional) {
		attributes.push('opt');
	}

	if (item.nullable === true) {
		attributes.push('nullable');
	}
	else if (item.nullable === false) {
		attributes.push('non-null');
	}

	return attributes;
}

function updateItemName(item) {
	const attributes = getSignatureAttributes(item);
	let itemName = item.name || '';

	if (item.variable) {
		itemName = '&hellip;' + itemName;
	}

	if (attributes && attributes.length) {
		itemName = util.format('%s<span class="signature-attributes">%s</span>', itemName,
			attributes.join(', '));
	}

	return itemName;
}

function addParamAttributes(params) {
	return params.filter(function(param) {
		return param.name && param.name.indexOf('.') === -1;
	}).map(updateItemName);
}

function buildItemTypeStrings(item) {
	const types = [];

	if (item && item.type && item.type.names) {
		item.type.names.forEach(function(name) {
			types.push(linkto(name, htmlsafe(name)));
		});
	}

	return types;
}

function buildAttribsString(attribs) {
	let attribsString = '';

	if (attribs && attribs.length) {
		attribsString = htmlsafe(attribs.join(', '));
	}

	return attribsString;
}

function addNonParamAttributes(items) {
	let types = [];

	items.forEach(function(item) {
		types = types.concat(buildItemTypeStrings(item));
	});

	return types;
}

function addSignatureParams(f) {
	const params = f.params ? addParamAttributes(f.params) : [];

	f.signature = util.format('%s(%s)', (f.signature || ''), params.join(', '));
}

function addSignatureReturns(f) {
	const attribs = [];
	let attribsString = '';
	let returnTypes = [];
	let returnTypesString = '';

	// jam all the return-type attributes into an array. this could create odd results (for example,
	// if there are both nullable and non-nullable return types), but let's assume that most people
	// who use multiple @return tags aren't using Closure Compiler type annotations, and vice-versa.
	if (f.returns) {
		f.returns.forEach(function(item) {
			helper.getAttribs(item).forEach(function(attrib) {
				if (attribs.indexOf(attrib) === -1) {
					attribs.push(attrib);
				}
			});
		});

		attribsString = buildAttribsString(attribs);
	}

	if (f.returns) {
		returnTypes = addNonParamAttributes(f.returns);
	}
	if (returnTypes.length) {
		returnTypesString = util.format(' &rarr; %s{%s}', attribsString, returnTypes.join('|'));
	}

	f.signature = '<span class="signature">' + (f.signature || '') + '</span>' +
        '<span class="return-type-signature">' + returnTypesString + '</span>';
}

function addSignatureTypes(f) {
	const types = f.type ? buildItemTypeStrings(f) : [];

	f.signature = (f.signature || '') + '<span class="type-signature">' +
        (types.length ? '' + types.join('|') : '') + '</span>';
}

function addAttribs(f) {
	const attribs = helper.getAttribs(f);
	if (attribs.length) {
		let str = '';
		attribs.forEach(function(a) {
			str = str + `<span class="method-type-signature is-${a}">${a}</span>`;
		});
		f.attribs = str;
	}
}

function shortenPaths(files, commonPrefix) {
	Object.keys(files).forEach(function(file) {
		files[file].shortened = files[file].resolved.replace(commonPrefix, '')
		// always use forward slashes
			.replace(/\\/g, '/');
	});

	return files;
}

function getPathFromDoclet(doclet) {
	if (!doclet.meta) {
		return null;
	}

	return doclet.meta.path && doclet.meta.path !== 'null' ?
		path.join(doclet.meta.path, doclet.meta.filename) :
		doclet.meta.filename;
}

function generate(title, kind, docs, filename, resolveLinks) {
	resolveLinks = resolveLinks === false ? false : true;

	const docData = {
		env: env,
		title: title,
		kind: kind,
		docs: docs,
	};

	let outpath = path.join(outdir, filename),
		html = view.render('container.tmpl', docData);

	if (resolveLinks) {
		html = helper.resolveLinks(html); // turn {@link foo} into <a href="foodoc.html">foo</a>
	}

	fs.writeFileSync(outpath, html, 'utf8');
}

function generateSourceFiles(sourceFiles, encoding) {
	encoding = encoding || 'utf8';
	Object.keys(sourceFiles).forEach(function(file) {
		let source;
		// links are keyed to the shortened path in each doclet's `meta.shortpath` property
		const sourceOutfile = helper.getUniqueFilename(sourceFiles[file].shortened);
		helper.registerLink(sourceFiles[file].shortened, sourceOutfile);

		try {
			source = {
				kind: 'source',
				code: helper.htmlsafe(fs.readFileSync(sourceFiles[file].resolved, encoding)),
			};
		}
		catch (e) {
			logger.error('Error while generating source file %s: %s', file, e.message);
		}

		generate(sourceFiles[file].shortened, 'source', [source], sourceOutfile,
			false);
	});
}

/**
 * Look for classes or functions with the same name as modules (which indicates that the module
 * exports only that class or function), then attach the classes or functions to the `module`
 * property of the appropriate module doclets. The name of each class or function is also updated
 * for display purposes. This function mutates the original arrays.
 *
 * @private
 * @param {Array.<module:jsdoc/doclet.Doclet>} doclets - The array of classes and functions to
 * check.
 * @param {Array.<module:jsdoc/doclet.Doclet>} modules - The array of module doclets to search.
 */
function attachModuleSymbols(doclets, modules) {
	const symbols = {};

	// build a lookup table
	doclets.forEach(function(symbol) {
		symbols[symbol.longname] = symbols[symbol.longname] || [];
		symbols[symbol.longname].push(symbol);
	});

	return modules.map(function(module) {
		if (symbols[module.longname]) {
			module.modules = symbols[module.longname]
			// Only show symbols that have a description. Make an exception for classes, because
			// we want to show the constructor-signature heading no matter what.
				.filter(function(symbol) {
					return symbol.description || symbol.kind === 'class';
				})
				.map(function(symbol) {
					symbol = doop(symbol);

					if (symbol.kind === 'class' || symbol.kind === 'function') {
						symbol.name = symbol.name.replace('module:', '(require("') + '"))';
					}

					return symbol;
				});
		}
	});
}

/**
 *
 * @param {{longname: string, name: string, kind: string}[]} items
 * @param {string} itemHeading Navigation section heading
 * @param {Object} itemsSeen Items already processed?
 * @param {function} linktoFn Function to parse the link to the item
 * @returns
 */
function buildMemberNav(items, itemHeading, itemsSeen, linktoFn) {
	const nav = [];
	const conf = env.conf.templates || {};

	conf.default = conf.default || {};

	if (items && items.length) {
		const itemsNav = '';

		nav.push(buildNavHeading(itemHeading));

		items.forEach(function(item) {
			const methods = find({ kind: 'function', memberof: item.longname });
			const members = find({ kind: 'member', memberof: item.longname });
			const typedefs = find({ kind: 'typedef', memberof: item.longname });
			const events = find({ kind: 'event', memberof: item.longname });
			let displayName;

			if (!hasOwnProp.call(item, 'longname')) {
				nav.push(buildNavItem(linktoFn('', item.name)));
				return;
			}

			if (!hasOwnProp.call(itemsSeen, item.longname)) {
				if (conf.default.useLongnameInNav) {
					displayName = item.longname;

					if (conf.default.useLongnameInNav > 0 && conf.default.useLongnameInNav !== true) {
						const num = conf.default.useLongnameInNav;
						const cropped = item.longname.split('.').slice(-num).join('.');
						if (cropped !== displayName) {
							displayName = '...' + cropped;
						}
					}
				}
				else {
					displayName = item.name;
				}

				displayName = displayName.replace(/^module:/g, '');

				if (itemHeading === 'Tutorials') {
					nav.push(buildNavItem(linktoFn(item.longname, displayName)));
				}
				else {
					nav.push(buildNavHeading(buildNavType(item.kind, linktoFn(item.longname, displayName))));
				}

				if (members.length) {
					members.forEach(function(member) {
						if (member.inherited && conf.showInheritedInNav === false) {
							return;
						}
						nav.push(buildNavItem(buildNavType(member.kind, linkto(member.longname, member.name))));
					});
				}

				if (methods.length) {
					methods.forEach(function(method) {
						if (method.inherited && conf.showInheritedInNav === false) {
							return;
						}
						nav.push(buildNavItem(buildNavType(method.kind, linkto(method.longname, method.name))));
					});
				}

				if (typedefs.length && env.conf.opts.showTypedefsInNav) {
					typedefs.forEach(function(typedef) {
						if (typedef.inherited && conf.showInheritedInNav === false) {
							return;
						}
						nav.push(buildNavItem(buildNavType(typedef.kind, linkto(typedef.longname, typedef.name))));
					});
				}

				if (events.length) {
					events.forEach(function(event) {
						if (event.inherited && conf.showInheritedInNav === false) {
							return;
						}
						nav.push(buildNavItem(buildNavType(event.kind, linkto(event.longname, event.name))));
					});
				}

				itemsSeen[item.longname] = true;
			}
		});
	}

	if (nav.length > 0) {
		return '<ul>' + nav.join('') + '</ul>';
	}
	else {
		return '';
	}

	// return nav
}

function linktoTutorial(longName, name) {
	return tutoriallink(name);
}

function linktoExternal(longName, name) {
	return linkto(longName, name.replace(/(^"|"$)/g, ''));
}

/**
 * Create an HTML link for a custom defined link in jsdoc.json
 * @param {{title: string, link: string, target: string}} link
 * @returns {string} The HTML link in an anchor tag
 */
function linktoLink(link) {
	return `<a href="${link.link}" target="${link.target}">${link.title}</a>`;
}

/**
 * Create the navigation sidebar.
 * @param {object} members The members that will be used to create the sidebar.
 * @param {array<object>} members.classes
 * @param {array<object>} members.externals
 * @param {array<object>} members.globals
 * @param {array<object>} members.mixins
 * @param {array<object>} members.modules
 * @param {array<object>} members.namespaces
 * @param {array<object>} members.tutorials
 * @param {array<object>} members.events
 * @param {array<object>} members.interfaces
 * @return {array} The HTML for the navigation sidebar.
 */
function buildNav(members) {
	let nav = [];
	const seen = {};
	const seenTutorials = {};

	// console.log('--- members ----');
	// console.log(members.events);

	// Add custom menu links from jsdoc.json
	// env.conf.menu will be of type {title: string, link: string, target: string}[]
	if (env.conf.menu.length) {
		const customLinks = [];

		customLinks.push(buildNavHeading('Links'));

		env.conf.menu.forEach(function(link) {
			if (!hasOwnProp.call(seen, link.title)) {
				customLinks.push(buildNavItem(linktoLink(link)));
			}

			seen[link.title] = true;
		});

		nav = nav.concat('<ul>' + customLinks.join('') + '</ul>');
	}

	nav = nav.concat(buildMemberNav(members.tutorials, 'Tutorials', seenTutorials, linktoTutorial));
	nav = nav.concat(buildMemberNav(members.classes, 'Classes', seen, linkto));
	nav = nav.concat(buildMemberNav(members.modules, 'Modules', {}, linkto));
	nav = nav.concat(buildMemberNav(members.externals, 'Externals', seen, linktoExternal));
	nav = nav.concat(buildMemberNav(members.namespaces, 'Namespaces', seen, linkto));
	nav = nav.concat(buildMemberNav(members.mixins, 'Mixins', seen, linkto));
	nav = nav.concat(buildMemberNav(members.interfaces, 'Interfaces', seen, linkto));

	if (members.globals.length) {
		nav.push(buildNavHeading(linkto('global', 'Globals')));

		members.globals.forEach(function(item) {
			if (!hasOwnProp.call(seen, item.longname)) {
				nav.push(buildNavItem(buildNavType(item.kind, linkto(item.longname, item.name))));
			}

			seen[item.longname] = true;
		});
	}

	return nav.join('');
}

/**
    @param {TAFFY} taffyData See <http://taffydb.com/>.
    @param {object} opts
    @param {Tutorial} tutorials
 */
exports.publish = function(taffyData, opts, tutorials) {
	data = taffyData;

	const conf = env.conf.templates || {};
	conf.default = conf.default || {};

	const templatePath = path.normalize(opts.template);
	view = new template.Template(path.join(templatePath, 'tmpl'));

	// claim some special filenames in advance, so the All-Powerful Overseer of Filename Uniqueness
	// doesn't try to hand them out later
	const indexUrl = helper.getUniqueFilename('index');
	// don't call registerLink() on this one! 'index' is also a valid longname

	const globalUrl = helper.getUniqueFilename('global');
	helper.registerLink('global', globalUrl);

	// set up templating
	view.layout = conf.default.layoutFile ?
		path.getResourcePath(path.dirname(conf.default.layoutFile),
			path.basename(conf.default.layoutFile)) :
		'layout.tmpl';

	// set up tutorials for helper
	helper.setTutorials(tutorials);

	data = helper.prune(data);
	data.sort('longname, version, since');
	helper.addEventListeners(data);

	let sourceFiles = {};
	const sourceFilePaths = [];
	data().each(function(doclet) {
		doclet.attribs = '';

		if (doclet.examples) {
			doclet.examples = doclet.examples.map(function(example) {
				let caption, code;

				if (example.match(/^\s*<caption>([\s\S]+?)<\/caption>(\s*[\n\r])([\s\S]+)$/i)) {
					caption = RegExp.$1;
					code = RegExp.$3;
				}

				return {
					caption: caption || '',
					code: code || example,
				};
			});
		}
		if (doclet.see) {
			doclet.see.forEach(function(seeItem, i) {
				doclet.see[i] = hashToLink(doclet, seeItem);
			});
		}

		// build a list of source files
		let sourcePath;
		if (doclet.meta) {
			sourcePath = getPathFromDoclet(doclet);
			sourceFiles[sourcePath] = {
				resolved: sourcePath,
				shortened: null,
			};
			if (sourceFilePaths.indexOf(sourcePath) === -1) {
				sourceFilePaths.push(sourcePath);
			}
		}
	});

	// update outdir if necessary, then create outdir
	const packageInfo = (find({ kind: 'package' }) || [])[0];
	if (packageInfo && packageInfo.name) {
		outdir = path.join(outdir, packageInfo.name, (packageInfo.version || ''));
	}
	fs.mkPath(outdir);

	// copy the template's static files to outdir
	const fromDir = path.join(templatePath, 'static');
	const staticFiles = fs.ls(fromDir, 3);

	staticFiles.forEach(function(fileName) {
		const toDir = fs.toDir(fileName.replace(fromDir, outdir));
		fs.mkPath(toDir);
		fs.copyFileSync(fileName, toDir);
	});

	// copy user-specified static files to outdir
	let staticFilePaths;
	let staticFileFilter;
	let staticFileScanner;
	if (conf.default.staticFiles) {
		// The canonical property name is `include`. We accept `paths` for backwards compatibility
		// with a bug in JSDoc 3.2.x.
		staticFilePaths = conf.default.staticFiles.include ||
            conf.default.staticFiles.paths ||
            [];
		staticFileFilter = new (require('jsdoc/src/filter')).Filter(conf.default.staticFiles);
		staticFileScanner = new (require('jsdoc/src/scanner')).Scanner();

		staticFilePaths.forEach(function(filePath) {
			let extraStaticFiles;

			filePath = path.resolve(env.pwd, filePath);
			extraStaticFiles = staticFileScanner.scan([filePath], 10, staticFileFilter);

			extraStaticFiles.forEach(function(fileName) {
				const sourcePath = fs.toDir(filePath);
				const toDir = fs.toDir(fileName.replace(sourcePath, outdir));
				fs.mkPath(toDir);
				fs.copyFileSync(fileName, toDir);
			});
		});
	}

	if (sourceFilePaths.length) {
		sourceFiles = shortenPaths(sourceFiles, path.commonPrefix(sourceFilePaths));
	}
	data().each(function(doclet) {
		const url = helper.createLink(doclet);
		helper.registerLink(doclet.longname, url);

		// add a shortened version of the full path
		let docletPath;
		if (doclet.meta) {
			docletPath = getPathFromDoclet(doclet);
			docletPath = sourceFiles[docletPath].shortened;
			if (docletPath) {
				doclet.meta.shortpath = docletPath;
			}
		}
	});

	data().each(function(doclet) {
		const url = helper.longnameToUrl[doclet.longname];

		if (url.indexOf('#') > -1) {
			doclet.id = helper.longnameToUrl[doclet.longname].split(/#/).pop();
		}
		else {
			doclet.id = doclet.name;
		}

		if (needsSignature(doclet)) {
			addSignatureParams(doclet);
			addSignatureReturns(doclet);
			addAttribs(doclet);
		}
	});

	// do this after the urls have all been generated
	data().each(function(doclet) {
		doclet.ancestors = getAncestorLinks(doclet);

		if (doclet.kind === 'member') {
			addSignatureTypes(doclet);
			addAttribs(doclet);
		}

		if (doclet.kind === 'constant') {
			addSignatureTypes(doclet);
			addAttribs(doclet);
			doclet.kind = 'member';
		}
	});

	const members = helper.getMembers(data);
	members.tutorials = tutorials.children;

	// output pretty-printed source files by default
	const outputSourceFiles = conf.default && conf.default.outputSourceFiles !== false ? true :
		false;

	// add template helpers
	view.find = find;
	view.linkto = linkto;
	view.resolveAuthorLinks = resolveAuthorLinks;
	view.tutoriallink = tutoriallink;
	view.htmlsafe = htmlsafe;
	view.outputSourceFiles = outputSourceFiles;

	// once for all
	view.nav = buildNav(members);
	attachModuleSymbols(find({ longname: { left: 'module:' } }), members.modules);

	// generate the pretty-printed source files first so other pages can link to them
	if (outputSourceFiles) {
		generateSourceFiles(sourceFiles, opts.encoding);
	}

	if (members.globals.length) { generate('Global', '', [{ kind: 'globalobj' }], globalUrl); }

	// index page displays information from package.json and lists files
	const files = find({ kind: 'file' }),
		packages = find({ kind: 'package' });

	// Remove Page title for Main Page (set in Readme instead)
	generate('', '',
		packages.concat(
			[{ kind: 'mainpage', readme: opts.readme, longname: (opts.mainpagetitle) ? opts.mainpagetitle : 'Main Page' }],
		).concat(files),
		indexUrl);

	// set up the lists that we'll use to generate pages
	const classes = taffy(members.classes);
	const modules = taffy(members.modules);
	const namespaces = taffy(members.namespaces);
	const mixins = taffy(members.mixins);
	const externals = taffy(members.externals);
	const interfaces = taffy(members.interfaces);

	Object.keys(helper.longnameToUrl).forEach(function(longname) {
		const myModules = helper.find(modules, { longname: longname });
		if (myModules.length) {
			generate(myModules[0].name, 'Module', myModules, helper.longnameToUrl[longname]);
		}

		const myClasses = helper.find(classes, { longname: longname });
		if (myClasses.length) {
			generate(myClasses[0].name, 'Class', myClasses, helper.longnameToUrl[longname]);
		}

		const myNamespaces = helper.find(namespaces, { longname: longname });
		if (myNamespaces.length) {
			generate(myNamespaces[0].name, 'Namespace', myNamespaces, helper.longnameToUrl[longname]);
		}

		const myMixins = helper.find(mixins, { longname: longname });
		if (myMixins.length) {
			generate(myMixins[0].name, 'Mixin', myMixins, helper.longnameToUrl[longname]);
		}

		const myExternals = helper.find(externals, { longname: longname });
		if (myExternals.length) {
			generate(myExternals[0].name, 'External', myExternals, helper.longnameToUrl[longname]);
		}

		const myInterfaces = helper.find(interfaces, { longname: longname });
		if (myInterfaces.length) {
			generate(myInterfaces[0].name, 'Interface', myInterfaces, helper.longnameToUrl[longname]);
		}
	});

	// TODO: move the tutorial functions to templateHelper.js
	function generateTutorial(title, tutorial, filename) {
		const tutorialData = {
			title: title,
			header: tutorial.title,
			content: tutorial.parse(),
			children: tutorial.children,
		};

		let tutorialPath = path.join(outdir, filename),
			html = view.render('tutorial.tmpl', tutorialData);

		// yes, you can use {@link} in tutorials too!
		html = helper.resolveLinks(html); // turn {@link foo} into <a href="foodoc.html">foo</a>

		fs.writeFileSync(tutorialPath, html, 'utf8');
	}

	// tutorials can have only one parent so there is no risk for loops
	function saveChildren(node) {
		node.children.forEach(function(child) {
			generateTutorial('Tutorial: ' + child.title, child, helper.tutorialToUrl(child.name));
			saveChildren(child);
		});
	}
	saveChildren(tutorials);
};

/**
 * Helper to generate navigation list link wrapper around navigation links for
 * locations.
 *
 * @param {String} linkClass navigation link classname
 * @param {String} linkContent navigation link HTML content
 * @return {String}
 */
function buildNavLink(linkClass, linkContent) {
	return [
		'<li class="nav-link nav-' + linkClass + '-link">',
		linkContent,
		'</li>',
	].join('');
}

function buildNavType(type, typeLink) {
	return [
		'<span class="nav-item-type type-' + type + '" title="' + type + '">',
		type[0].toUpperCase(),
		'</span>',

		`<span class="nav-item-name is-${type}">`,
		typeLink,
		'</span>',
	].join('');
}

/**
 * Helper to generate navigation list header wrapper around navigation header content
 * for headings and filenames.
 *
 * @param {String} content navigation header content
 * @return {String}
 */
function buildNavHeading(content) {
	return [
		'<li class="nav-heading">',
		content,
		'</li>',
	].join('');
}

/**
 * Helper for generating generic navigation wrapper around content passed for
 * methods, and types.
 *
 * @param {String} itemContent navigation item content
 * @return {String}
 */
function buildNavItem(itemContent) {
	return [
		'<li class="nav-item">',
		itemContent,
		'</li>',
	].join('');
}
