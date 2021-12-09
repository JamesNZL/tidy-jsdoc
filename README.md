# tidy-jsdoc

A minimalist and clean [jsdoc](https://jsdoc.app/index.html) template. 

Forked from [tidy-jsdoc](https://github.com/julie-ng/tidy-jsdoc).

### Features

 - Custom styles via [CSS variables](#adjusting-theme-with-css-variables)
 - Code syntax highlighting via [Prism.js](https://prismjs.com/)

## Preview

#### Examples

- [Pronto](https://jamesnzl.github.io/Pronto)
- [Newton Graph Library](https://julie-ng.github.io/newtonjs-graph/)

<img src="./images/v1-preview-newtonjs.png" alt="Version 1.0 - Preview" style="max-width:100%;">

Based on the [default jsdoc template](https://github.com/jsdoc/jsdoc/tree/master/templates) and inspired in design by [vue.js documentation](https://vuejs.org/v2/api/) and [docsify](https://docsify.js.org).

## Usage

### Add Dependency

To use this jsdoc template in a project, first install the packages:

```
npm install --save-dev jsdoc JamesNZL/tidy-jsdoc
```

### Generate Docs

Once you've configured jsdoc and added syntax to your JavaScript files, you can generate the HTML files like so, optionally including a readme file:

```
jsdoc --readme README.md -c jsdoc.json
```

### Configure JSDoc

Then configure jsdoc to use the tidy template. Below is an example `jsdoc.json` configuration file. Be sure to adjust

- **template**  
	Points to `./node_modules/tidy-jsdoc`

- **prism-theme**  
	Optionally pick a prismjs theme for styling your code. Defaults to "prism-tomorrow-night". Choose from templates available in [`./static/styles/vendor/`](./static/styles/vendor/) folder

- **destination**  
	Output is `./docs/`, allowing for easy GitHub Pages publishing.

- **metadata**  
	Customize title, logo, favicon, etc.

- **styles**  
	Lets you customise colours, etc. See details below.

```javascript
{
  "tags": {
    "allowUnknownTags": true,
    "dictionaries": [
      "jsdoc",
      "closure"
    ]
  },
  "source": {
    "include": [
      "src"
    ],
    "includePattern": ".+\\.js(doc)?$",
    "excludePattern": "(^|\\/|\\\\)_"
  },
  "opts": {
    "template": "./node_modules/tidy-jsdoc",
    "prism-theme": "prism-custom",
    "encoding": "utf8",
    "destination": "./docs/",
    "recurse": true
  },
  "plugins": [
    "plugins/markdown",
    "plugins/summarize"
  ],
  "templates": {
    "cleverLinks": false,
    "monospaceLinks": false
  },
  "metadata": {
    "title": "My JavaScript Library",
  }
}
```

## Customize the Template

### Adjusting Theme with CSS variables

This template is styled via CSS variables, so you can adjust it to your brand. Inside your `jsdoc.json` configuration file, add an addional `styles` property, for example:

```javascript
{
  "metadata": "...",
  "styles": {
    "text-colour": "#111",		
    "primary-colour": "blue",
    "heading-colour": "var(--primary-colour)"
  }	
}
```

This would output in your document `<head>`:

```html
<style>
  :root {
    --text-colour: #111;
    --primary-colour: blue;
    --heading-colour: var(--primary-colour);
  }
<style>
```
The keys and values are arbitrary, but the CSS should be valid. For a full list of the available variables, see [styles.css](./static/styles/styles.css).


## Development

For more information about creating jsdoc templates, see the [jsdoc GitHub repository](https://github.com/jsdoc/jsdoc/tree/master/templates).