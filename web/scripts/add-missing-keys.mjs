/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import fs from 'node:fs/promises'
import path from 'node:path'

const newKeys = {
  en: {
    'Add column': 'Add column',
    'Add footer link': 'Add footer link',
    'Add social link': 'Add social link',
    'Action label': 'Action label',
    'Action label and URL must be provided together':
      'Action label and URL must be provided together',
    'Action label is required': 'Action label is required',
    'Action label must be 40 characters or fewer':
      'Action label must be 40 characters or fewer',
    'Action URL': 'Action URL',
    'Action URL must be 500 characters or fewer':
      'Action URL must be 500 characters or fewer',
    'Column title': 'Column title',
    'Column title is required': 'Column title is required',
    'Column title must be 80 characters or fewer':
      'Column title must be 80 characters or fewer',
    'Configure the label and destination for this footer link.':
      'Configure the label and destination for this footer link.',
    'Configure the label, destination, and icon for this social link.':
      'Configure the label, destination, and icon for this social link.',
    'Delete column': 'Delete column',
    'Delete footer column?': 'Delete footer column?',
    'Delete footer link?': 'Delete footer link?',
    'Edit column': 'Edit column',
    'Edit footer link': 'Edit footer link',
    'Edit social link': 'Edit social link',
    'Enter a valid footer link': 'Enter a valid footer link',
    'Enter a valid image URL': 'Enter a valid image URL',
    'Enter a valid promotion URL': 'Enter a valid promotion URL',
    'Failed to read icon file': 'Failed to read icon file',
    'Footer columns': 'Footer columns',
    'Footer description': 'Footer description',
    'Image URL': 'Image URL',
    'Image URL must be 500 characters or fewer':
      'Image URL must be 500 characters or fewer',
    'Link groups displayed on the right side of the footer.':
      'Link groups displayed on the right side of the footer.',
    'Links displayed beside the site description.':
      'Links displayed beside the site description.',
    'Manage the description, social links, and link columns shown in the homepage footer.':
      'Manage the description, social links, and link columns shown in the homepage footer.',
    'Manage the promotion shown below the wallet balance.':
      'Manage the promotion shown below the wallet balance.',
    'Move column down': 'Move column down',
    'Move column up': 'Move column up',
    'No footer columns configured': 'No footer columns configured',
    'No social links configured': 'No social links configured',
    'Please choose a PNG, JPG, WebP, or GIF image':
      'Please choose a PNG, JPG, WebP, or GIF image',
    'Please upload an icon': 'Please upload an icon',
    'Promotion description': 'Promotion description',
    'Promotion description must be 240 characters or fewer':
      'Promotion description must be 240 characters or fewer',
    'Promotion title': 'Promotion title',
    'Promotion title is required': 'Promotion title is required',
    'Promotion title must be 80 characters or fewer':
      'Promotion title must be 80 characters or fewer',
    'Set the heading shown above a group of footer links.':
      'Set the heading shown above a group of footer links.',
    'Social links': 'Social links',
    'Show promotion': 'Show promotion',
    'Supports PNG, JPG, WebP, or GIF. Maximum file size: 100 KB.':
      'Supports PNG, JPG, WebP, or GIF. Maximum file size: 100 KB.',
    'Text shown below the site name.': 'Text shown below the site name.',
    'The column and all links inside it will be removed after you save.':
      'The column and all links inside it will be removed after you save.',
    'Use an HTTP(S) image URL': 'Use an HTTP(S) image URL',
    'Use an internal path or an HTTP(S) URL':
      'Use an internal path or an HTTP(S) URL',
    'Wallet promotion': 'Wallet promotion',
  },
  zh: {
    'Add column': '添加分栏',
    'Add footer link': '添加页脚链接',
    'Add social link': '添加社交链接',
    'Action label': '操作文案',
    'Action label and URL must be provided together':
      '操作文案和链接地址必须同时填写',
    'Action label is required': '请输入操作文案',
    'Action label must be 40 characters or fewer': '操作文案不能超过 40 个字符',
    'Action URL': '操作链接',
    'Action URL must be 500 characters or fewer': '操作链接不能超过 500 个字符',
    'Column title': '分栏标题',
    'Column title is required': '请输入分栏标题',
    'Column title must be 80 characters or fewer': '分栏标题不能超过 80 个字符',
    'Configure the label and destination for this footer link.':
      '设置该页脚链接的标题和目标地址。',
    'Configure the label, destination, and icon for this social link.':
      '设置该社交链接的标题、目标地址和图标。',
    'Delete column': '删除分栏',
    'Delete footer column?': '删除页脚分栏？',
    'Delete footer link?': '删除页脚链接？',
    'Edit column': '编辑分栏',
    'Edit footer link': '编辑页脚链接',
    'Edit social link': '编辑社交链接',
    'Enter a valid footer link': '请输入有效的页脚链接',
    'Enter a valid image URL': '请输入有效的图片链接',
    'Enter a valid promotion URL': '请输入有效的推广链接',
    'Failed to read icon file': '无法读取图标文件',
    'Footer columns': '页脚分栏',
    'Footer description': '页脚说明',
    'Image URL': '图片链接',
    'Image URL must be 500 characters or fewer': '图片链接不能超过 500 个字符',
    'Link groups displayed on the right side of the footer.':
      '显示在页脚右侧的链接分组。',
    'Links displayed beside the site description.': '显示在站点说明旁的链接。',
    'Manage the description, social links, and link columns shown in the homepage footer.':
      '管理主页页脚中的说明、社交链接和链接分栏。',
    'Manage the promotion shown below the wallet balance.':
      '管理显示在钱包余额下方的推广内容。',
    'Move column down': '下移分栏',
    'Move column up': '上移分栏',
    'No footer columns configured': '尚未配置页脚分栏',
    'No social links configured': '尚未配置社交链接',
    'Please choose a PNG, JPG, WebP, or GIF image':
      '请选择 PNG、JPG、WebP 或 GIF 图片',
    'Please upload an icon': '请上传图标',
    'Promotion description': '推广说明',
    'Promotion description must be 240 characters or fewer':
      '推广说明不能超过 240 个字符',
    'Promotion title': '推广标题',
    'Promotion title is required': '请输入推广标题',
    'Promotion title must be 80 characters or fewer':
      '推广标题不能超过 80 个字符',
    'Set the heading shown above a group of footer links.':
      '设置一组页脚链接上方显示的标题。',
    'Social links': '社交链接',
    'Show promotion': '显示推广内容',
    'Supports PNG, JPG, WebP, or GIF. Maximum file size: 100 KB.':
      '支持 PNG、JPG、WebP 或 GIF，文件大小上限为 100 KB。',
    'Text shown below the site name.': '显示在站点名称下方的文字。',
    'The column and all links inside it will be removed after you save.':
      '保存后，该分栏及其中的所有链接都会被删除。',
    'Use an HTTP(S) image URL': '使用 HTTP(S) 图片链接',
    'Use an internal path or an HTTP(S) URL': '使用站内路径或 HTTP(S) 链接',
    'Wallet promotion': '钱包推广',
  },
  'zh-TW': {
    'Add column': '新增分欄',
    'Add footer link': '新增頁尾連結',
    'Add social link': '新增社群連結',
    'Action label': '操作文案',
    'Action label and URL must be provided together':
      '操作文案與連結網址必須同時填寫',
    'Action label is required': '請輸入操作文案',
    'Action label must be 40 characters or fewer': '操作文案不能超過 40 個字元',
    'Action URL': '操作連結',
    'Action URL must be 500 characters or fewer': '操作連結不能超過 500 個字元',
    'Column title': '分欄標題',
    'Column title is required': '請輸入分欄標題',
    'Column title must be 80 characters or fewer': '分欄標題不能超過 80 個字元',
    'Configure the label and destination for this footer link.':
      '設定此頁尾連結的標題與目標網址。',
    'Configure the label, destination, and icon for this social link.':
      '設定此社群連結的標題、目標網址與圖示。',
    'Delete column': '刪除分欄',
    'Delete footer column?': '刪除頁尾分欄？',
    'Delete footer link?': '刪除頁尾連結？',
    'Edit column': '編輯分欄',
    'Edit footer link': '編輯頁尾連結',
    'Edit social link': '編輯社群連結',
    'Enter a valid footer link': '請輸入有效的頁尾連結',
    'Enter a valid image URL': '請輸入有效的圖片連結',
    'Enter a valid promotion URL': '請輸入有效的推廣連結',
    'Failed to read icon file': '無法讀取圖標檔案',
    'Footer columns': '頁尾分欄',
    'Footer description': '頁尾說明',
    'Image URL': '圖片連結',
    'Image URL must be 500 characters or fewer': '圖片連結不能超過 500 個字元',
    'Link groups displayed on the right side of the footer.':
      '顯示於頁尾右側的連結群組。',
    'Links displayed beside the site description.': '顯示於網站說明旁的連結。',
    'Manage the description, social links, and link columns shown in the homepage footer.':
      '管理首頁頁尾中的說明、社群連結與連結分欄。',
    'Manage the promotion shown below the wallet balance.':
      '管理顯示於錢包餘額下方的推廣內容。',
    'Move column down': '下移分欄',
    'Move column up': '上移分欄',
    'No footer columns configured': '尚未設定頁尾分欄',
    'No social links configured': '尚未設定社群連結',
    'Please choose a PNG, JPG, WebP, or GIF image':
      '請選擇 PNG、JPG、WebP 或 GIF 圖片',
    'Please upload an icon': '請上傳圖標',
    'Promotion description': '推廣說明',
    'Promotion description must be 240 characters or fewer':
      '推廣說明不能超過 240 個字元',
    'Promotion title': '推廣標題',
    'Promotion title is required': '請輸入推廣標題',
    'Promotion title must be 80 characters or fewer':
      '推廣標題不能超過 80 個字元',
    'Set the heading shown above a group of footer links.':
      '設定一組頁尾連結上方顯示的標題。',
    'Social links': '社群連結',
    'Show promotion': '顯示推廣內容',
    'Supports PNG, JPG, WebP, or GIF. Maximum file size: 100 KB.':
      '支援 PNG、JPG、WebP 或 GIF，檔案大小上限為 100 KB。',
    'Text shown below the site name.': '顯示於網站名稱下方的文字。',
    'The column and all links inside it will be removed after you save.':
      '儲存後，此分欄及其中所有連結都會被刪除。',
    'Use an HTTP(S) image URL': '使用 HTTP(S) 圖片連結',
    'Use an internal path or an HTTP(S) URL': '使用站內路徑或 HTTP(S) 連結',
    'Wallet promotion': '錢包推廣',
  },
  fr: {
    'Add column': 'Ajouter une colonne',
    'Add footer link': 'Ajouter un lien de pied de page',
    'Add social link': 'Ajouter un lien social',
    'Action label': 'Libellé de l’action',
    'Action label and URL must be provided together':
      'Le libellé et l’URL de l’action doivent être renseignés ensemble',
    'Action label is required': 'Le libellé de l’action est requis',
    'Action label must be 40 characters or fewer':
      'Le libellé de l’action ne doit pas dépasser 40 caractères',
    'Action URL': 'URL de l’action',
    'Action URL must be 500 characters or fewer':
      'L’URL de l’action ne doit pas dépasser 500 caractères',
    'Column title': 'Titre de la colonne',
    'Column title is required': 'Le titre de la colonne est requis',
    'Column title must be 80 characters or fewer':
      'Le titre de la colonne ne doit pas dépasser 80 caractères',
    'Configure the label and destination for this footer link.':
      'Configurez le libellé et la destination de ce lien de pied de page.',
    'Configure the label, destination, and icon for this social link.':
      'Configurez le libellé, la destination et l’icône de ce lien social.',
    'Delete column': 'Supprimer la colonne',
    'Delete footer column?': 'Supprimer la colonne du pied de page ?',
    'Delete footer link?': 'Supprimer le lien du pied de page ?',
    'Edit column': 'Modifier la colonne',
    'Edit footer link': 'Modifier le lien du pied de page',
    'Edit social link': 'Modifier le lien social',
    'Enter a valid footer link': 'Saisissez un lien de pied de page valide',
    'Enter a valid image URL': 'Saisissez une URL d’image valide',
    'Enter a valid promotion URL': 'Saisissez une URL de promotion valide',
    'Failed to read icon file': "Impossible de lire le fichier d'icône",
    'Footer columns': 'Colonnes du pied de page',
    'Footer description': 'Description du pied de page',
    'Image URL': 'URL de l’image',
    'Image URL must be 500 characters or fewer':
      'L’URL de l’image ne doit pas dépasser 500 caractères',
    'Link groups displayed on the right side of the footer.':
      'Groupes de liens affichés à droite du pied de page.',
    'Links displayed beside the site description.':
      'Liens affichés à côté de la description du site.',
    'Manage the description, social links, and link columns shown in the homepage footer.':
      'Gérez la description, les liens sociaux et les colonnes du pied de page d’accueil.',
    'Manage the promotion shown below the wallet balance.':
      'Gérez la promotion affichée sous le solde du portefeuille.',
    'Move column down': 'Descendre la colonne',
    'Move column up': 'Monter la colonne',
    'No footer columns configured': 'Aucune colonne de pied de page configurée',
    'No social links configured': 'Aucun lien social configuré',
    'Please choose a PNG, JPG, WebP, or GIF image':
      'Choisissez une image PNG, JPG, WebP ou GIF',
    'Please upload an icon': 'Veuillez importer une icône',
    'Promotion description': 'Description de la promotion',
    'Promotion description must be 240 characters or fewer':
      'La description de la promotion ne doit pas dépasser 240 caractères',
    'Promotion title': 'Titre de la promotion',
    'Promotion title is required': 'Le titre de la promotion est requis',
    'Promotion title must be 80 characters or fewer':
      'Le titre de la promotion ne doit pas dépasser 80 caractères',
    'Set the heading shown above a group of footer links.':
      'Définissez le titre affiché au-dessus d’un groupe de liens.',
    'Social links': 'Liens sociaux',
    'Show promotion': 'Afficher la promotion',
    'Supports PNG, JPG, WebP, or GIF. Maximum file size: 100 KB.':
      'Prend en charge PNG, JPG, WebP ou GIF. Taille maximale : 100 Ko.',
    'Text shown below the site name.': 'Texte affiché sous le nom du site.',
    'The column and all links inside it will be removed after you save.':
      'La colonne et tous ses liens seront supprimés après l’enregistrement.',
    'Use an HTTP(S) image URL': 'Utilisez une URL d’image HTTP(S)',
    'Use an internal path or an HTTP(S) URL':
      'Utilisez un chemin interne ou une URL HTTP(S)',
    'Wallet promotion': 'Promotion du portefeuille',
  },
  ja: {
    'Add column': '列を追加',
    'Add footer link': 'フッターリンクを追加',
    'Add social link': 'ソーシャルリンクを追加',
    'Action label': 'アクションラベル',
    'Action label and URL must be provided together':
      'アクションラベルとURLは両方入力してください',
    'Action label is required': 'アクションラベルを入力してください',
    'Action label must be 40 characters or fewer':
      'アクションラベルは40文字以内で入力してください',
    'Action URL': 'アクションURL',
    'Action URL must be 500 characters or fewer':
      'アクションURLは500文字以内で入力してください',
    'Column title': '列のタイトル',
    'Column title is required': '列のタイトルを入力してください',
    'Column title must be 80 characters or fewer':
      '列のタイトルは80文字以内で入力してください',
    'Configure the label and destination for this footer link.':
      'フッターリンクの表示名とリンク先を設定します。',
    'Configure the label, destination, and icon for this social link.':
      'ソーシャルリンクの表示名、リンク先、アイコンを設定します。',
    'Delete column': '列を削除',
    'Delete footer column?': 'フッター列を削除しますか？',
    'Delete footer link?': 'フッターリンクを削除しますか？',
    'Edit column': '列を編集',
    'Edit footer link': 'フッターリンクを編集',
    'Edit social link': 'ソーシャルリンクを編集',
    'Enter a valid footer link': '有効なフッターリンクを入力してください',
    'Enter a valid image URL': '有効な画像URLを入力してください',
    'Enter a valid promotion URL': '有効なプロモーションURLを入力してください',
    'Failed to read icon file': 'アイコンファイルを読み取れませんでした',
    'Footer columns': 'フッター列',
    'Footer description': 'フッターの説明',
    'Image URL': '画像URL',
    'Image URL must be 500 characters or fewer':
      '画像URLは500文字以内で入力してください',
    'Link groups displayed on the right side of the footer.':
      'フッター右側に表示するリンクグループです。',
    'Links displayed beside the site description.':
      'サイト説明の横に表示するリンクです。',
    'Manage the description, social links, and link columns shown in the homepage footer.':
      'ホームページのフッターに表示する説明、ソーシャルリンク、リンク列を管理します。',
    'Manage the promotion shown below the wallet balance.':
      'ウォレット残高の下に表示するプロモーションを管理します。',
    'Move column down': '列を下へ移動',
    'Move column up': '列を上へ移動',
    'No footer columns configured': 'フッター列は設定されていません',
    'No social links configured': 'ソーシャルリンクは設定されていません',
    'Please choose a PNG, JPG, WebP, or GIF image':
      'PNG、JPG、WebP、GIF形式の画像を選択してください',
    'Please upload an icon': 'アイコンをアップロードしてください',
    'Promotion description': 'プロモーションの説明',
    'Promotion description must be 240 characters or fewer':
      'プロモーションの説明は240文字以内で入力してください',
    'Promotion title': 'プロモーションのタイトル',
    'Promotion title is required': 'プロモーションのタイトルを入力してください',
    'Promotion title must be 80 characters or fewer':
      'プロモーションのタイトルは80文字以内で入力してください',
    'Set the heading shown above a group of footer links.':
      'フッターリンクのグループ上部に表示する見出しを設定します。',
    'Social links': 'ソーシャルリンク',
    'Show promotion': 'プロモーションを表示',
    'Supports PNG, JPG, WebP, or GIF. Maximum file size: 100 KB.':
      'PNG、JPG、WebP、GIFに対応。最大ファイルサイズ: 100 KB。',
    'Text shown below the site name.': 'サイト名の下に表示するテキストです。',
    'The column and all links inside it will be removed after you save.':
      '保存すると、この列と列内のすべてのリンクが削除されます。',
    'Use an HTTP(S) image URL': 'HTTP(S)画像URLを使用してください',
    'Use an internal path or an HTTP(S) URL':
      '内部パスまたはHTTP(S) URLを使用してください',
    'Wallet promotion': 'ウォレットプロモーション',
  },
  ru: {
    'Add column': 'Добавить колонку',
    'Add footer link': 'Добавить ссылку в подвал',
    'Add social link': 'Добавить социальную ссылку',
    'Action label': 'Текст действия',
    'Action label and URL must be provided together':
      'Текст действия и URL должны быть указаны вместе',
    'Action label is required': 'Укажите текст действия',
    'Action label must be 40 characters or fewer':
      'Текст действия не должен превышать 40 символов',
    'Action URL': 'URL действия',
    'Action URL must be 500 characters or fewer':
      'URL действия не должен превышать 500 символов',
    'Column title': 'Заголовок колонки',
    'Column title is required': 'Укажите заголовок колонки',
    'Column title must be 80 characters or fewer':
      'Заголовок колонки не должен превышать 80 символов',
    'Configure the label and destination for this footer link.':
      'Настройте название и адрес ссылки в подвале.',
    'Configure the label, destination, and icon for this social link.':
      'Настройте название, адрес и значок социальной ссылки.',
    'Delete column': 'Удалить колонку',
    'Delete footer column?': 'Удалить колонку подвала?',
    'Delete footer link?': 'Удалить ссылку в подвале?',
    'Edit column': 'Изменить колонку',
    'Edit footer link': 'Изменить ссылку в подвале',
    'Edit social link': 'Изменить социальную ссылку',
    'Enter a valid footer link': 'Введите корректную ссылку для подвала',
    'Enter a valid image URL': 'Введите корректный URL изображения',
    'Enter a valid promotion URL': 'Введите корректный URL промоакции',
    'Failed to read icon file': 'Не удалось прочитать файл иконки',
    'Footer columns': 'Колонки подвала',
    'Footer description': 'Описание подвала',
    'Image URL': 'URL изображения',
    'Image URL must be 500 characters or fewer':
      'URL изображения не должен превышать 500 символов',
    'Link groups displayed on the right side of the footer.':
      'Группы ссылок справа в подвале.',
    'Links displayed beside the site description.':
      'Ссылки рядом с описанием сайта.',
    'Manage the description, social links, and link columns shown in the homepage footer.':
      'Настройте описание, социальные ссылки и колонки ссылок в подвале главной страницы.',
    'Manage the promotion shown below the wallet balance.':
      'Настройте промоакцию, отображаемую под балансом кошелька.',
    'Move column down': 'Переместить колонку вниз',
    'Move column up': 'Переместить колонку вверх',
    'No footer columns configured': 'Колонки подвала не настроены',
    'No social links configured': 'Социальные ссылки не настроены',
    'Please choose a PNG, JPG, WebP, or GIF image':
      'Выберите изображение в формате PNG, JPG, WebP или GIF',
    'Please upload an icon': 'Загрузите иконку',
    'Promotion description': 'Описание промоакции',
    'Promotion description must be 240 characters or fewer':
      'Описание промоакции не должно превышать 240 символов',
    'Promotion title': 'Заголовок промоакции',
    'Promotion title is required': 'Укажите заголовок промоакции',
    'Promotion title must be 80 characters or fewer':
      'Заголовок промоакции не должен превышать 80 символов',
    'Set the heading shown above a group of footer links.':
      'Задайте заголовок над группой ссылок в подвале.',
    'Social links': 'Социальные ссылки',
    'Show promotion': 'Показывать промоакцию',
    'Supports PNG, JPG, WebP, or GIF. Maximum file size: 100 KB.':
      'Поддерживаются PNG, JPG, WebP и GIF. Максимальный размер файла: 100 КБ.',
    'Text shown below the site name.': 'Текст под названием сайта.',
    'The column and all links inside it will be removed after you save.':
      'После сохранения колонка и все ссылки в ней будут удалены.',
    'Use an HTTP(S) image URL': 'Используйте URL изображения HTTP(S)',
    'Use an internal path or an HTTP(S) URL':
      'Используйте внутренний путь или URL HTTP(S)',
    'Wallet promotion': 'Промоакция кошелька',
  },
  vi: {
    'Add column': 'Thêm cột',
    'Add footer link': 'Thêm liên kết chân trang',
    'Add social link': 'Thêm liên kết mạng xã hội',
    'Action label': 'Nhãn hành động',
    'Action label and URL must be provided together':
      'Nhãn hành động và URL phải được cung cấp cùng nhau',
    'Action label is required': 'Vui lòng nhập nhãn hành động',
    'Action label must be 40 characters or fewer':
      'Nhãn hành động không được vượt quá 40 ký tự',
    'Action URL': 'URL hành động',
    'Action URL must be 500 characters or fewer':
      'URL hành động không được vượt quá 500 ký tự',
    'Column title': 'Tiêu đề cột',
    'Column title is required': 'Vui lòng nhập tiêu đề cột',
    'Column title must be 80 characters or fewer':
      'Tiêu đề cột không được vượt quá 80 ký tự',
    'Configure the label and destination for this footer link.':
      'Cấu hình nhãn và địa chỉ cho liên kết chân trang này.',
    'Configure the label, destination, and icon for this social link.':
      'Cấu hình nhãn, địa chỉ và biểu tượng cho liên kết mạng xã hội này.',
    'Delete column': 'Xóa cột',
    'Delete footer column?': 'Xóa cột chân trang?',
    'Delete footer link?': 'Xóa liên kết chân trang?',
    'Edit column': 'Sửa cột',
    'Edit footer link': 'Sửa liên kết chân trang',
    'Edit social link': 'Sửa liên kết mạng xã hội',
    'Enter a valid footer link': 'Nhập liên kết chân trang hợp lệ',
    'Enter a valid image URL': 'Nhập URL hình ảnh hợp lệ',
    'Enter a valid promotion URL': 'Nhập URL khuyến mãi hợp lệ',
    'Failed to read icon file': 'Không thể đọc tệp biểu tượng',
    'Footer columns': 'Các cột chân trang',
    'Footer description': 'Mô tả chân trang',
    'Image URL': 'URL hình ảnh',
    'Image URL must be 500 characters or fewer':
      'URL hình ảnh không được vượt quá 500 ký tự',
    'Link groups displayed on the right side of the footer.':
      'Các nhóm liên kết hiển thị bên phải chân trang.',
    'Links displayed beside the site description.':
      'Các liên kết hiển thị cạnh phần mô tả trang web.',
    'Manage the description, social links, and link columns shown in the homepage footer.':
      'Quản lý mô tả, liên kết mạng xã hội và các cột liên kết trong chân trang chủ.',
    'Manage the promotion shown below the wallet balance.':
      'Quản lý khuyến mãi hiển thị bên dưới số dư ví.',
    'Move column down': 'Di chuyển cột xuống',
    'Move column up': 'Di chuyển cột lên',
    'No footer columns configured': 'Chưa cấu hình cột chân trang',
    'No social links configured': 'Chưa cấu hình liên kết mạng xã hội',
    'Please choose a PNG, JPG, WebP, or GIF image':
      'Vui lòng chọn ảnh PNG, JPG, WebP hoặc GIF',
    'Please upload an icon': 'Vui lòng tải lên biểu tượng',
    'Promotion description': 'Mô tả khuyến mãi',
    'Promotion description must be 240 characters or fewer':
      'Mô tả khuyến mãi không được vượt quá 240 ký tự',
    'Promotion title': 'Tiêu đề khuyến mãi',
    'Promotion title is required': 'Vui lòng nhập tiêu đề khuyến mãi',
    'Promotion title must be 80 characters or fewer':
      'Tiêu đề khuyến mãi không được vượt quá 80 ký tự',
    'Set the heading shown above a group of footer links.':
      'Đặt tiêu đề hiển thị phía trên một nhóm liên kết chân trang.',
    'Social links': 'Liên kết mạng xã hội',
    'Show promotion': 'Hiển thị khuyến mãi',
    'Supports PNG, JPG, WebP, or GIF. Maximum file size: 100 KB.':
      'Hỗ trợ PNG, JPG, WebP hoặc GIF. Kích thước tệp tối đa: 100 KB.',
    'Text shown below the site name.': 'Văn bản hiển thị dưới tên trang web.',
    'The column and all links inside it will be removed after you save.':
      'Cột và tất cả liên kết bên trong sẽ bị xóa sau khi lưu.',
    'Use an HTTP(S) image URL': 'Dùng URL hình ảnh HTTP(S)',
    'Use an internal path or an HTTP(S) URL':
      'Dùng đường dẫn nội bộ hoặc URL HTTP(S)',
    'Wallet promotion': 'Khuyến mãi ví',
  },
}

for (const [locale, additions] of Object.entries(newKeys)) {
  const file = path.resolve(`src/i18n/locales/${locale}.json`)
  const messages = JSON.parse(await fs.readFile(file, 'utf8'))
  messages.translation = Object.fromEntries(
    Object.entries({ ...messages.translation, ...additions }).sort(([a], [b]) =>
      a.localeCompare(b)
    )
  )
  await fs.writeFile(file, `${JSON.stringify(messages, null, 2)}\n`)
}
