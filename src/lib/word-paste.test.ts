import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isWordHtml, paletteColor, rtfImages } from './word-paste.ts'

test('Word colours map to the editor palette', () => {
  assert.equal(paletteColor('#7F0000'), 'red')
  assert.equal(paletteColor('#C00000'), 'red')
  assert.equal(paletteColor('#2F5496'), 'blue')
  assert.equal(paletteColor('#00B050'), 'green')
  assert.equal(paletteColor('#7030A0'), 'purple')
  assert.equal(paletteColor('#808080'), 'gray')
  assert.equal(paletteColor('windowtext'), null)
  assert.equal(paletteColor('#000000'), null)
  assert.equal(paletteColor('yellow', 'background'), 'yellow')
  assert.equal(paletteColor('white', 'background'), null)
  assert.equal(paletteColor('rgb(237, 125, 49)'), 'orange')
})

test('Word clipboard HTML is recognised', () => {
  assert.ok(isWordHtml('<html xmlns:w="urn:schemas-microsoft-com:office:word"><p class=MsoNormal>x</p>'))
  assert.ok(!isWordHtml('<p>hola</p>'))
})

test('pictures are read from the RTF copy (PNG kept, metafile copy skipped)', () => {
  const png = '89504e470d0a1a0a0000000d49484452000000010000000108020000009077'
  const rtf = `{\\rtf1{\\*\\shppict{\\pict{\\*\\picprop{\\sp{\\sn a}{\\sv b}}}\\picw10\\pngblip\\bliptag-1234{\\*\\blipuid 0a}\n${png.slice(0, 40)}\n${png.slice(40)}}}{\\nonshppict{\\pict\\wmetafile8 0100090000}}}`
  const imgs = rtfImages(rtf)
  assert.equal(imgs.length, 1)
  assert.equal(imgs[0].type, 'image/png')
  assert.equal(Buffer.from(imgs[0].bytes).toString('hex'), png)
})
