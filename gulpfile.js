var gulp = require('gulp'),
  nodemon = require('gulp-nodemon'),
  plumber = require('gulp-plumber'),
  livereload = require('gulp-livereload'),
  jshint = require('gulp-jshint'),
  gutil = require('gulp-util'),
  sass = require('gulp-sass');
var fs = require('fs-extra');

// Initialize required directories
gulp.task('init', function() {
  gutil.log('Synchronously creating required directories');
  fs.ensureDirSync('./public/');
  fs.ensureDirSync('./data/');
  fs.ensureDirSync('./logs/');
  fs.ensureDirSync('./etc/');
  fs.ensureDirSync('./etc/ssl/');
  fs.ensureDirSync('./resources/');
  // Add any other required directories here
});

// Lint Task
gulp.task('lint', function() {
  gulp.src('./public/js/**/*.js')
    .pipe(jshint())
    .pipe(jshint.reporter('default', {verbose: true}));
});

gulp.task('sass', function () {
  gulp.src('./sass/style.scss')
    .pipe(plumber())
    .pipe(sass().on('error', sass.logError))
    .pipe(gulp.dest('./public/css'))
    .pipe(livereload());
});

gulp.task('watch', function() {
  gulp.watch('./sass/**/*.scss', ['sass']);
});

gulp.task('develop', ['init'], function () {
  livereload.listen();
  nodemon({
    script: 'app.js',
    ext: 'js coffee swig',
  }).on('restart', function () {
    setTimeout(function () {
      livereload.changed(__dirname);
    }, 500);
  });
});

gulp.task('default', [
  'init',
  'lint',
  'sass',
  'develop',
  'watch'
]);
