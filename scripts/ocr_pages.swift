import Foundation
import Vision
import AppKit
import ImageIO

func ocr(path: String) -> String {
    let url = URL(fileURLWithPath: path)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
        return ""
    }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = true
    req.recognitionLanguages = ["en-US", "en-GB"]
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do {
        try handler.perform([req])
    } catch {
        return ""
    }
    let obs = req.results ?? []
    var lines: [String] = []
    for o in obs {
        if let t = o.topCandidates(1).first?.string {
            lines.append(t)
        }
    }
    return lines.joined(separator: "\n")
}

let args = CommandLine.arguments.dropFirst()
if args.isEmpty {
    fputs("usage: ocr_pages.swift image.jpg [...]\n", stderr)
    exit(1)
}
for p in args {
    let text = ocr(path: p)
    print("-----FILE:\(p)-----")
    print(text)
}
