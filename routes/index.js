var express = require('express');
var router = express.Router();
var scissors = require('scissors');
var fs = require('fs');
var PDFParser = require("pdf2json");
var utf8 = require('utf8');

var pdfLocationIn = __dirname + '/../files/in.pdf'
var pdfLocationOut = __dirname + '/../files/out.pdf'

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index', {
        'error': req.query.error == 1
    });
});

router.get('/download', function(req, res) {
    generatePdf(pdfLocationIn, pdfLocationOut, (error) => {
        if (error) {
            res.redirect("..?error=1");
        } else {
            res.download(pdfLocationOut, 'document-trie.pdf');
        }
    })
})

router.post('/upload', function(req, res) {
    var fstream;
    req.pipe(req.busboy);
    req.busboy.on('file', function(fieldname, file, filename) {
        console.log("Uploading: " + filename);
        //Path where image will be uploaded
        fstream = fs.createWriteStream(pdfLocationIn);
        file.pipe(fstream);
        fstream.on('close', function() {
            console.log("Upload Finished of " + filename);
            res.redirect('..'); //where to go next
        })
    });
});

function reorderPdf(inFile, outFile, pagesOrder, callback) {
    var sc = scissors(inFile);
    var pdf = sc.pages.apply(sc, pagesOrder),
        output = fs.createWriteStream(outFile);

    output.on('finish', callback);

    pdf.pdfStream().pipe(output)
}

function isThatText(value) {
    return utf8.decode(unescape(value)).startsWith("L'int");
    //startsWith("L\'int%C3%A9ress%C3%A9")
}

function isThatTextRun(textRun) {
    return isThatText(textRun.T);
}

function searchTextInTextBlock(textBlock) {
    for (var i = 0; i < textBlock.R.length; i++) {
        let textRun = textBlock.R[i];
        if (isThatTextRun(textRun)) {
            return textRun.T;
        }
    }
    return undefined;
}

function searchTextInPage(page) {
    for (var i = 0; i < page.Texts.length; i++) {
        let textBlock = page.Texts[i];
        let text = searchTextInTextBlock(textBlock);
        if (typeof text !== 'undefined') {
            return text;
        }
    }
    return undefined;
}

function search(pdfData, callback) {
    pdfData.formImage.Pages.forEach((page, index) => {
        if (index % 2 == 0) {
            let text = searchTextInPage(page);
            callback(index, text);
        }
    })
}

function extractNamesFromUText(text) {
    words = text.split(',')[0].split(" ");
    return {
        'first': words[2],
        'last': words.slice(3).join(" ")
    }
}

function buildPageIndex(pdfData) {
    var pageIndex = [];
    search(pdfData, (index, text) => {
        let utext = utf8.decode(unescape(text));
        names = extractNamesFromUText(utext);
        pageIndex.push({
            index: index,
            firstName: names.first.toLowerCase(),
            lastName: names.last.toLowerCase()
        })
    })
    return pageIndex;
}

function sortPageIndex(pageIndex) {
    function nameCompare(str1, str2) {
        return str1 < str2 ? -1 : +(str1 > str2);
    }

    return pageIndex.sort((a, b) => {
        var cmp = nameCompare(a.lastName, b.lastName);
        if (cmp == 0) {
            cmp = nameCompare(a.firstName, b.firstName);
        }
        return cmp;
    })
}

function buildPageOrder(pageIndex) {
    var pageOrder = [];

    pageIndex.forEach((entry) => {
        pageOrder.push(entry.index + 1, entry.index + 2);
    })

    return pageOrder;
}


function generatePdf(inFile, outFile, callback) {

    var pdfParser = new PDFParser();

    pdfParser.on("pdfParser_dataError", errData => callback(true));
    pdfParser.on("pdfParser_dataReady", pdfData => {
        // fs.writeFile("out.json", JSON.stringify(pdfData.formImage.Pages.slice(0, 2)));
        //console.log(JSON.stringify(pdfData));
        try {
            var pageIndex = buildPageIndex(pdfData);
            sortPageIndex(pageIndex);
            var pageOrder = buildPageOrder(pageIndex);
            reorderPdf(inFile, outFile, pageOrder, callback);
        } catch (e) {
	    console.log(e);
            callback(true);
        }
    });

    fs.readFile(inFile, (err, buffer) => {
        if (err) {
	    console.log(err);
            callback(true);
        } else {
            pdfParser.parseBuffer(buffer);
        }
    });
}

module.exports = router;
